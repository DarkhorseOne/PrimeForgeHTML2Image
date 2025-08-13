# Use official Playwright image for correct browser deps
FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app

# Install additional fonts (Noto CJK, Emoji) for broad language coverage
RUN apt-get update && apt-get install -y --no-install-recommends \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f -v

COPY package.json package-lock.json* ./
RUN npm i --omit=dev

COPY . .

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    MAX_BODY=1mb \
    DEFAULT_DPR=2 \
    MAX_WIDTH=4000 \
    MAX_HEIGHT=4000 \
    MAX_PIXELS=14000000 \
    BLOCK_EXTERNAL=true \
    ALLOW_URL=false \
    ALLOWLIST_DOMAINS= \
    TEMPLATES_DIR=/app/templates \
    PRESETS_PATH=/app/templates/presets/presets.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "start"]
