import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { chromium } from 'playwright';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import Handlebars from 'handlebars';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './swagger.js';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const MAX_BODY = process.env.MAX_BODY || '1mb';
const DEFAULT_DPR = Number(process.env.DEFAULT_DPR || 1);
const MAX_WIDTH = Number(process.env.MAX_WIDTH || 4000);
const MAX_HEIGHT = Number(process.env.MAX_HEIGHT || 4000);
const MAX_PIXELS = Number(process.env.MAX_PIXELS || 14_000_000);
const BLOCK_EXTERNAL = /^true$/i.test(process.env.BLOCK_EXTERNAL || 'true');
const ALLOW_URL = /^true$/i.test(process.env.ALLOW_URL || 'false');
const ALLOWLIST = (process.env.ALLOWLIST_DOMAINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.join(process.cwd(), 'templates');
const PRESETS_PATH = process.env.PRESETS_PATH || path.join(TEMPLATES_DIR, 'presets', 'presets.json');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: MAX_BODY }));
app.use(pinoHttp({ logger }));

// Load presets once
let PRESETS = { sizes: {}, clips: {}, fontSizes: {} };
try {
  const raw = fs.readFileSync(PRESETS_PATH, 'utf8');
  PRESETS = JSON.parse(raw);
  logger.info({ sizes: Object.keys(PRESETS.sizes), clips: Object.keys(PRESETS.clips) }, 'presets_loaded');
} catch (e) {
  logger.warn({ err: e }, 'presets_load_failed');
}

// Compile templates and cache
const templateCache = new Map();
const isDevelopment = process.env.NODE_ENV === 'development';

function getTemplate(name) {
  // Skip cache in development mode for hot reloading
  if (!isDevelopment && templateCache.has(name)) {
    return templateCache.get(name);
  }
  
  const file = path.join(TEMPLATES_DIR, 'html', `${name}.hbs`);
  const tpl = fs.readFileSync(file, 'utf8');
  const compiled = Handlebars.compile(tpl, { noEscape: true });
  
  // Only cache in production mode
  if (!isDevelopment) {
    templateCache.set(name, compiled);
  }
  
  return compiled;
}

function hostnameOf(u) {
  try { return new URL(u).hostname; } catch { return null; }
}

function isWhitelisted(u) {
  const h = hostnameOf(u);
  if (!h) return false;
  if (ALLOWLIST.length === 0) return false;
  return ALLOWLIST.some(pattern => {
    if (pattern.startsWith('*.')) {
      const dom = pattern.slice(2);
      return h === dom || h.endsWith('.' + dom);
    }
    return h === pattern;
  });
}

let browser;
async function getBrowser() {
  // Check if browser exists and is still connected
  if (browser) {
    try {
      // Test if browser is still alive by checking contexts
      await browser.contexts();
    } catch (err) {
      logger.warn('Browser instance disconnected, recreating...');
      browser = null;
    }
  }
  
  if (!browser) {
    browser = await chromium.launch({
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-gpu',
        '--font-render-hinting=none',
        '--disable-features=IsolateOrigins,site-per-process'
      ],
      headless: true
    });
    logger.info('Chromium launched');
  }
  return browser;
}

async function withPage(fn) {
  let retries = 3;
  let lastError;
  
  while (retries > 0) {
    try {
      const br = await getBrowser();
      const context = await br.newContext({
        deviceScaleFactor: DEFAULT_DPR,
        javaScriptEnabled: true,
        viewport: { width: 1200, height: 630 },
        bypassCSP: false,
      });

      // network control
      await context.route('**/*', (route) => {
        if (!BLOCK_EXTERNAL) return route.continue();
        const req = route.request();
        const url = req.url();
        if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        if (ALLOW_URL && isWhitelisted(url)) return route.continue();
        return route.abort();
      });

      const page = await context.newPage();
      try {
        return await fn(page);
      } finally {
        await page.close();
        await context.close();
      }
    } catch (err) {
      lastError = err;
      retries--;
      
      // If browser is closed, reset it
      if (err.message && err.message.includes('Target page, context or browser has been closed')) {
        logger.warn(`Browser error, retrying... (${3 - retries}/3)`);
        browser = null;
        await new Promise(resolve => setTimeout(resolve, 500)); // Small delay before retry
      } else {
        // For other errors, don't retry
        throw err;
      }
    }
  }
  
  throw lastError;
}

const RenderSchema = z.object({
  html: z.string().optional(),
  url: z.string().url().optional(),

  // Template rendering
  templateName: z.string().optional(),
  templateData: z.record(z.any()).optional(),

  width: z.number().int().min(1).max(10000).optional(),
  height: z.number().int().min(1).max(10000).optional(),
  sizePreset: z.string().optional(),

  // Custom font sizes
  mainTitleSize: z.string().optional(),
  subtitleSize: z.string().optional(),
  bodySize: z.string().optional(),

  // DPR / quality / format
  dpr: z.number().min(0.5).max(4).optional(),
  format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  quality: z.number().int().min(1).max(100).optional(),

  // capture options
  fullPage: z.boolean().default(false),
  omitBackground: z.boolean().default(false),
  clip: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  clipPreset: z.string().optional(),

  // timing
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('networkidle'),
  waitFor: z.union([z.number().int().min(0).max(30000), z.string()]).optional(),
  timeout: z.number().int().min(0).max(60000).optional(),

  // extra css injected into <head>
  css: z.string().optional(),
});

function enforceSize({ width, height }) {
  const w = Math.min(width || 1200, MAX_WIDTH);
  const h = Math.min(height || 630, MAX_HEIGHT);
  if (w * h > MAX_PIXELS) {
    throw new Error(`Requested viewport ${w}x${h} exceeds maximum pixel budget ${MAX_PIXELS}`);
  }
  return { width: w, height: h };
}

/**
 * @swagger
 * /:
 *   get:
 *     summary: Service homepage
 *     description: Landing page with service information and usage examples
 *     tags:
 *       - UI
 *     responses:
 *       200:
 *         description: Homepage HTML
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
app.get('/', (req, res) => {
  // Read package.json for service info
  const packageInfo = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  
  // Get available templates
  const templates = fs.readdirSync(path.join(TEMPLATES_DIR, 'html'))
    .filter(f => f.endsWith('.hbs'))
    .map(f => f.replace('.hbs', ''));
  
  // Get sizes
  const sizes = PRESETS.sizes || {};
  
  // Compile and render the index template
  const indexTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'index.hbs'), 'utf8');
  const compiledIndex = Handlebars.compile(indexTemplate);
  
  const baseUrl = req.protocol + '://' + req.get('host');
  
  const html = compiledIndex({
    name: packageInfo.name,
    version: packageInfo.version,
    description: packageInfo.description || 'A service that converts HTML templates to images using Playwright',
    license: packageInfo.license,
    templates: templates,
    sizes: sizes,
    baseUrl: baseUrl
  });
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

/**
 * @swagger
 * /healthz:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the service
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 */
app.get('/healthz', (req, res) => res.json({ ok: true }));

/**
 * @swagger
 * /presets:
 *   get:
 *     summary: Get available presets
 *     description: Returns all available size presets, clip presets, and font size presets
 *     tags:
 *       - Configuration
 *     responses:
 *       200:
 *         description: Available presets
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sizes:
 *                   type: object
 *                   description: Size presets
 *                 clips:
 *                   type: object
 *                   description: Clip region presets
 *                 fontSizes:
 *                   type: object
 *                   description: Font size presets
 */
app.get('/presets', (req, res) => {
  res.json(PRESETS);
});

/**
 * @swagger
 * /render-html:
 *   post:
 *     summary: Render HTML from template
 *     description: Renders a template with provided data and returns the HTML
 *     tags:
 *       - Rendering
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RenderHtmlRequest'
 *     responses:
 *       200:
 *         description: Rendered HTML
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/render-html', (req, res) => {
  const { templateName, templateData } = req.body;
  
  if (!templateName) {
    return res.status(400).json({ error: 'Template name is required' });
  }
  
  try {
    const tpl = getTemplate(templateName);
    const html = tpl(templateData || {});
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    logger.error({ err }, 'html_render_failed');
    return res.status(400).json({ error: err.message || 'HTML render failed' });
  }
});

/**
 * @swagger
 * /preview:
 *   get:
 *     summary: Template preview UI
 *     description: Returns an interactive UI for testing templates
 *     tags:
 *       - UI
 *     responses:
 *       200:
 *         description: Preview UI HTML page
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
app.get('/preview', (req, res) => {
  // Read available templates dynamically
  const templates = fs.readdirSync(path.join(TEMPLATES_DIR, 'html'))
    .filter(f => f.endsWith('.hbs'))
    .map(f => {
      const name = f.replace('.hbs', '');
      return {
        name: name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ')
      };
    });
  
  // Prepare sizes with display names
  const sizesWithDisplay = {};
  Object.keys(PRESETS.sizes || {}).forEach(key => {
    sizesWithDisplay[key] = {
      ...PRESETS.sizes[key],
      displayName: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    };
  });
  
  // Prepare font sizes with display names
  const fontSizesWithDisplay = {};
  Object.keys(PRESETS.fontSizes || {}).forEach(key => {
    fontSizesWithDisplay[key] = {
      ...PRESETS.fontSizes[key],
      displayName: key.charAt(0).toUpperCase() + key.slice(1)
    };
  });
  
  // Create a templates metadata object for client-side use
  const templatesMetadata = {};
  templates.forEach(t => {
    templatesMetadata[t.name] = {
      displayName: t.displayName,
      // Add default size if you have metadata for templates
      defaultSize: t.name === 'rednote' ? 'rednote_1080x1440' : 
                   t.name === 'simple-card' ? 'twitter_card' : null
    };
  });
  
  // Compile and render the preview template
  const previewTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'preview.hbs'), 'utf8');
  const compiledPreview = Handlebars.compile(previewTemplate);
  
  const html = compiledPreview({
    templates: templates,
    sizes: sizesWithDisplay,
    fontSizes: fontSizesWithDisplay,
    templatesJSON: JSON.stringify(templatesMetadata),
    sizesJSON: JSON.stringify(sizesWithDisplay)
  });
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

/**
 * @swagger
 * /render:
 *   post:
 *     summary: Render HTML to image
 *     description: Converts HTML content or template to an image
 *     tags:
 *       - Rendering
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RenderRequest'
 *     responses:
 *       200:
 *         description: Generated image
 *         content:
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *           image/webp:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/render', async (req, res) => {
  const parsed = RenderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }
  const opts = parsed.data;

  try {
    // Apply size preset if provided
    let width = opts.width, height = opts.height;
    if (opts.sizePreset) {
      const sp = PRESETS.sizes?.[opts.sizePreset];
      if (!sp) throw new Error(`Unknown sizePreset: ${opts.sizePreset}`);
      width = sp.width; height = sp.height;
    }
    const size = enforceSize({ width, height });

    // Apply clip preset if provided (overrides clip)
    let clip = opts.clip;
    if (opts.clipPreset) {
      const cp = PRESETS.clips?.[opts.clipPreset];
      if (!cp) throw new Error(`Unknown clipPreset: ${opts.clipPreset}`);
      clip = cp;
    }

    const dpr = opts.dpr ?? DEFAULT_DPR;
    const { format, quality = 90, fullPage, omitBackground, waitUntil, waitFor, timeout = 15000 } = opts;

    const buffer = await withPage(async (page) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.emulateMedia({ media: 'screen' });
      await page.setDefaultTimeout(timeout);

      if (opts.templateName) {
        const tpl = getTemplate(opts.templateName);
        const templateData = {
          ...opts.templateData
        };
        const html = tpl(templateData);
        const finalHtml = opts.css ? html.replace('</head>', `<style>${opts.css}</style></head>`) : html;
        await page.setContent(finalHtml, { waitUntil });
      } else if (opts.html) {
        const html = opts.css ? opts.html.replace('</head>', `<style>${opts.css}</style></head>`) : opts.html;
        await page.setContent(html, { waitUntil });
      } else if (opts.url) {
        if (!ALLOW_URL) throw new Error('URL rendering disabled by server configuration');
        if (!isWhitelisted(opts.url)) throw new Error('URL not in allowlist');
        await page.goto(opts.url, { waitUntil });
      } else {
        throw new Error('Provide one of: html | templateName | url');
      }

      if (typeof waitFor === 'number') {
        await page.waitForTimeout(waitFor);
      } else if (typeof waitFor === 'string') {
        await page.waitForSelector(waitFor, { state: 'visible', timeout });
      }

      await page.setViewportSize({ width: size.width, height: size.height });
      await page.evaluate((dpr) => {
        Object.defineProperty(window, 'devicePixelRatio', { get: () => dpr });
      }, dpr);

      const screenshotOptions = {
        type: format,
        quality: format === 'png' ? undefined : quality,
        fullPage,
        omitBackground,
        clip,
      };

      return await page.screenshot(screenshotOptions);
    });

    res.setHeader('Content-Type', `image/${opts.format}`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (err) {
    req.log.error({ err }, 'render_failed');
    return res.status(400).json({ error: err.message || 'Render failed' });
  }
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing browser');
  try { await browser?.close(); } catch {}
  process.exit(0);
});

// Setup Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'HTML to Image API Documentation'
}));

/**
 * @swagger
 * /api-docs:
 *   get:
 *     summary: API Documentation
 *     description: Interactive Swagger UI documentation
 *     tags:
 *       - Documentation
 *     responses:
 *       200:
 *         description: Swagger UI page
 */

app.listen(PORT, () => {
  logger.info(`HTML→Image service listening on :${PORT} (env=${NODE_ENV})`);
  logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
});
