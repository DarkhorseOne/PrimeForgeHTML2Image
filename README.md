# HTML to Image Service

Self-hosted API for rendering **HTML/CSS** (or a whitelisted URL, or a Handlebars template) into **PNG/JPEG/WebP**. 

## Features

- **Multiple input sources**: HTML, Templates, or whitelisted URLs
- **Presets**: Size and crop presets; Handlebars HTML templates
- **High quality**: Configurable DPR (device pixel ratio) for crisp images
- **Development mode**: Template hot-reloading in development environment
- **Preview UI**: Interactive preview interface at `/preview`
- **Security-first**: URL allowlist, input validation, sandboxed rendering
- **Production-ready**: Docker support with multilingual fonts

## Available Templates

### 1. simple-card
A clean, minimalist card design suitable for social media sharing.

### 2. rednote-dark  
Dark theme template with gradient backgrounds, perfect for tech/AI content.

### 3. rednote-light
Light theme template with clean aesthetics, ideal for professional content.

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
# Server runs on http://localhost:3515
# Templates auto-reload on changes (no restart needed)
```

### Production

```bash
npm start
# Server runs on http://localhost:3000
# Templates are cached for performance
```

## API Usage

### Basic Example

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "templateName": "simple-card",
    "templateData": { 
      "badge": "SECURE", 
      "title": "Hello, Nick", 
      "subtitle": "Rendered by Playwright", 
      "bg": "#0b1021",
      "color": "#fff" 
    },
    "format": "png"
  }' \
  --output image.png
```

### Using Direct HTML

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<h1>Hello World</h1>",
    "css": "h1 { color: blue; }",
    "width": 800,
    "height": 400
  }' \
  --output image.png
```

## API Endpoints

### `POST /render`

Renders content to an image.

**Request Schema:**

```json
{
  "templateName": "simple-card",
  "templateData": { "title": "Hello" },
  "html": "<html>...</html>",
  "url": "https://example.com",
  "css": "body { font-size: 16px; }",
  "width": 1200,
  "height": 630,
  "sizePreset": "twitter_card",
  "clipPreset": "top_banner",
  "clip": { "x": 0, "y": 0, "width": 800, "height": 200 },
  "dpr": 2,
  "format": "png|jpeg|webp",
  "quality": 90,
  "fullPage": false,
  "omitBackground": false,
  "waitUntil": "load|domcontentloaded|networkidle",
  "waitFor": 1000,
  "timeout": 15000
}
```

> Provide **one of** `html` | `templateName` | `url`.

**Parameters:**

- **Input** (choose one):
  - `html` - Direct HTML string
  - `templateName` + `templateData` - Template with data
  - `url` - URL to render (requires whitelist)

- **Size** (optional):
  - `width`/`height` - Custom dimensions
  - `sizePreset` - Predefined sizes
  - `clipPreset` - Crop region presets
  - `clip` - Custom crop region

- **Rendering**:
  - `css` - Additional CSS to inject
  - `dpr` - Device pixel ratio (default: 2)
  - `format` - Output format: png (default), jpeg, webp
  - `quality` - JPEG/WebP quality (1-100, default: 90)
  - `fullPage` - Capture full scrollable page
  - `omitBackground` - Transparent background (PNG only)

- **Timing**:
  - `waitUntil` - When to consider page ready
  - `waitFor` - Additional wait time in ms
  - `timeout` - Maximum timeout in ms

### `GET /preview`

Interactive preview interface for testing templates and settings.

### `GET /presets`

Returns available size and clip presets.

### `GET /template/:name`

Renders a template with test data (HTML response).

### `GET /healthz`

Health check endpoint. Returns `{ ok: true }`.

## Configuration

### Environment Variables

```bash
PORT=3000                      # Server port
NODE_ENV=development          # Enable hot-reloading for templates
DEFAULT_DPR=2                 # Default device pixel ratio
ALLOW_URL=false              # Enable URL rendering
URL_ALLOWLIST=example.com    # Comma-separated domain whitelist
BLOCK_EXTERNAL=true          # Block external network requests
MAX_WIDTH=10000              # Maximum width limit
MAX_HEIGHT=10000             # Maximum height limit
MAX_PIXELS=100000000         # Maximum total pixels
TEMPLATES_DIR=/app/templates # Templates directory path
PRESETS_PATH=/app/templates/presets/presets.json # Presets config path
```

### Size Presets

Available in `templates/presets/presets.json`:

- `twitter_card` - 1200×630 (Twitter/X cards)
- `square_1080` - 1080×1080 (Instagram posts)
- `story_1080x1920` - 1080×1920 (Instagram/TikTok stories)
- `banner_1920x480` - 1920×480 (Website banners)
- `rednote_1080x1440` - 1080×1440 (RedNote vertical)
- `rednote_1080x1080` - 1080×1080 (RedNote square)

### Template Development

Templates are Handlebars files in `templates/html/*.hbs`:

```handlebars
<!DOCTYPE html>
<html>
<head>
    <style>
        h1 { color: {{color}}; }
    </style>
</head>
<body>
    <h1>{{title}}</h1>
    {{#if subtitle}}
    <h2>{{subtitle}}</h2>
    {{/if}}
    <div>{{{content}}}</div>
</body>
</html>
```

Available Handlebars variables depend on the template design.

## Docker Deployment

### Using Docker Compose

```yaml
version: '3.8'
services:
  html-to-image:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
      - DEFAULT_DPR=2
      - BLOCK_EXTERNAL=true
      - ALLOW_URL=false
      - TEMPLATES_DIR=/app/templates
      - PRESETS_PATH=/app/templates/presets/presets.json
    volumes:
      - ./templates:/app/templates
```

### Building and Running

```bash
# Build
docker build -t html-to-image .

# Run
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e DEFAULT_DPR=2 \
  html-to-image
```

## Font Support

The Docker image includes:
- Noto fonts (including CJK for Asian languages)
- Noto Color Emoji
- Liberation fonts

For custom fonts, add them to the `fonts/` directory and rebuild:

```dockerfile
COPY ./fonts /usr/share/fonts/custom
RUN fc-cache -f -v
```

## Security

- URL rendering is disabled by default
- When enabled, only whitelisted domains are allowed
- Templates are sandboxed and rendered in isolated browser contexts
- Input validation using Zod schemas
- External network requests can be blocked via `BLOCK_EXTERNAL`
- Size limits prevent resource exhaustion

### Recommended Production Settings

```bash
BLOCK_EXTERNAL=true    # Block external requests
ALLOW_URL=false       # Disable URL rendering
MAX_WIDTH=5000        # Reasonable limits
MAX_HEIGHT=5000
MAX_PIXELS=25000000
```

## n8n Integration

Use the HTTP Request node:

```json
{
  "method": "POST",
  "url": "http://html-to-image:3000/render",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "templateName": "simple-card",
    "templateData": {
      "title": "{{$json.title}}",
      "subtitle": "{{$json.subtitle}}"
    },
    "sizePreset": "twitter_card",
    "format": "png"
  },
  "responseFormat": "file"
}
```

## Troubleshooting

### Templates not updating
- Check `NODE_ENV=development` for hot-reloading
- In production, templates are cached - restart required

### Chinese/Emoji rendering issues
- Ensure fonts are installed (see Font Support section)
- Run `fc-cache -f -v` to refresh font cache

### Performance optimization
- Use `dpr: 1` for faster rendering if high quality not needed
- Enable template caching in production
- Consider implementing CDN for generated images

### Memory issues
- Playwright requires ~512MB minimum
- Recommend 1GB+ for production
- Monitor with `/healthz` endpoint

## License

MIT

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.