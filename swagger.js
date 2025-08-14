import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'HTML to Image Service API',
      version: '1.1.1',
      description: 'A service that converts HTML templates to images using Playwright, powered by DarkhorseOne Ltd.',
      contact: {
        name: 'DarkhorseOne Ltd.',
        url: 'https://darkhorse.one'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3515',
        description: 'Development server'
      },
      {
        url: 'https://your-domain.com/html2image',
        description: 'Production server (behind reverse proxy)'
      }
    ],
    components: {
      schemas: {
        TemplateData: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Main title for the template',
              example: 'AI Revolution 2024'
            },
            subtitle: {
              type: 'string',
              description: 'Subtitle for the template',
              example: 'The Future is Now'
            },
            content: {
              type: 'string',
              description: 'Content text for the template (use \\n for line breaks)',
              example: 'Artificial Intelligence is transforming every industry.\\nFrom healthcare to finance, AI is creating new possibilities.'
            },
            showHeader: {
              type: 'boolean',
              description: 'Whether to show the header section',
              default: false
            },
            showFooter: {
              type: 'boolean',
              description: 'Whether to show the footer section',
              default: false
            }
          }
        },
        RenderRequest: {
          type: 'object',
          required: ['templateName', 'templateData'],
          properties: {
            templateName: {
              type: 'string',
              description: 'Name of the template to use',
              enum: ['simple-card', 'rednote-dark', 'rednote-light'],
              example: 'simple-card'
            },
            templateData: {
              $ref: '#/components/schemas/TemplateData'
            },
            format: {
              type: 'string',
              description: 'Output image format',
              enum: ['png', 'jpeg', 'webp'],
              default: 'png'
            },
            quality: {
              type: 'integer',
              description: 'Image quality (1-100, only for jpeg and webp)',
              minimum: 1,
              maximum: 100,
              default: 90
            },
            width: {
              type: 'integer',
              description: 'Width in pixels (overrides size preset)',
              minimum: 1,
              maximum: 4000,
              example: 1200
            },
            height: {
              type: 'integer',
              description: 'Height in pixels (overrides size preset)',
              minimum: 1,
              maximum: 4000,
              example: 630
            },
            sizePreset: {
              type: 'string',
              description: 'Predefined size preset',
              enum: [
                'og_image',
                'twitter_card',
                'instagram_post',
                'instagram_story',
                'facebook_post',
                'youtube_thumbnail',
                'linkedin_post',
                'pinterest_pin',
                'rednote_1080x1440',
                'rednote_1080x1920'
              ]
            },
            dpr: {
              type: 'number',
              description: 'Device pixel ratio for high DPI displays',
              minimum: 0.5,
              maximum: 4,
              default: 1,
              example: 2
            },
            waitForTimeout: {
              type: 'integer',
              description: 'Time to wait before capturing (milliseconds)',
              minimum: 0,
              maximum: 10000,
              default: 1000
            },
            fullPage: {
              type: 'boolean',
              description: 'Capture full page height',
              default: false
            }
          }
        },
        RenderHtmlRequest: {
          type: 'object',
          required: ['templateName', 'templateData'],
          properties: {
            templateName: {
              type: 'string',
              description: 'Name of the template to use',
              enum: ['simple-card', 'rednote-dark', 'rednote-light'],
              example: 'simple-card'
            },
            templateData: {
              $ref: '#/components/schemas/TemplateData'
            }
          }
        },
        TemplateInfo: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Template identifier'
            },
            displayName: {
              type: 'string',
              description: 'Human-readable template name'
            },
            defaultSize: {
              type: 'string',
              description: 'Default size preset for this template'
            },
            description: {
              type: 'string',
              description: 'Template description'
            }
          }
        },
        SizeInfo: {
          type: 'object',
          properties: {
            displayName: {
              type: 'string',
              description: 'Human-readable size name'
            },
            width: {
              type: 'integer',
              description: 'Width in pixels'
            },
            height: {
              type: 'integer',
              description: 'Height in pixels'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            }
          }
        }
      }
    }
  },
  apis: ['./server.js'], // Path to the API routes
};

export default swaggerJsdoc(options);