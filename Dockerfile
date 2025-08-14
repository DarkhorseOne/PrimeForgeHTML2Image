# Use official Playwright image for correct browser deps
FROM mcr.microsoft.com/playwright:v1.54.2-jammy

WORKDIR /app

# Install comprehensive fonts for broad language and style coverage
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    wget \
    ca-certificates \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-cjk-extra \
    fonts-noto-color-emoji \
    fonts-noto-mono \
    fonts-liberation \
    fonts-liberation2 \
    fonts-dejavu \
    fonts-dejavu-core \
    fonts-dejavu-extra \
    fonts-roboto \
    fonts-ubuntu \
    fonts-open-sans \
    fonts-lato \
    fonts-firacode \
    fonts-inconsolata \
    fonts-droid-fallback \
    fonts-cantarell \
    fonts-oxygen \
    fonts-wqy-microhei \
    fonts-wqy-zenhei \
    fonts-arphic-ukai \
    fonts-arphic-uming \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

# Install Inter font and other web fonts locally
RUN mkdir -p /usr/share/fonts/truetype/google-fonts && \
    cd /usr/share/fonts/truetype/google-fonts && \
    # Inter font (critical for templates)
    wget -q -O inter.zip https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip && \
    unzip -q inter.zip && rm inter.zip && \
    # Source Sans Pro
    wget -q -O source-sans.zip https://github.com/adobe-fonts/source-sans/releases/download/3.052R/OTF-source-sans-3.052R.zip && \
    unzip -q source-sans.zip && rm source-sans.zip && \
    # Move all font files to proper location
    find . -name "*.ttf" -o -name "*.otf" | xargs -I {} mv {} . && \
    # Clean up subdirectories
    find . -type d ! -path . -exec rm -rf {} + 2>/dev/null || true && \
    # Update font cache
    fc-cache -f -v

# Set font configuration for better CJK rendering
RUN echo '<?xml version="1.0"?>\n\
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n\
<fontconfig>\n\
  <alias>\n\
    <family>sans-serif</family>\n\
    <prefer>\n\
      <family>Inter</family>\n\
      <family>Noto Sans</family>\n\
      <family>Noto Sans CJK SC</family>\n\
      <family>WenQuanYi Micro Hei</family>\n\
    </prefer>\n\
  </alias>\n\
  <alias>\n\
    <family>serif</family>\n\
    <prefer>\n\
      <family>Noto Serif</family>\n\
      <family>Noto Serif CJK SC</family>\n\
    </prefer>\n\
  </alias>\n\
  <alias>\n\
    <family>monospace</family>\n\
    <prefer>\n\
      <family>Fira Code</family>\n\
      <family>Noto Sans Mono</family>\n\
    </prefer>\n\
  </alias>\n\
</fontconfig>' > /etc/fonts/local.conf

# Copy custom fonts if they exist
COPY fonts/ /tmp/custom-fonts/ 
RUN if [ -d /tmp/custom-fonts ] && [ "$(ls -A /tmp/custom-fonts/*.ttf /tmp/custom-fonts/*.otf /tmp/custom-fonts/*.woff /tmp/custom-fonts/*.woff2 2>/dev/null)" ]; then \
        mkdir -p /usr/share/fonts/custom && \
        cp /tmp/custom-fonts/*.ttf /tmp/custom-fonts/*.otf /tmp/custom-fonts/*.woff /tmp/custom-fonts/*.woff2 /usr/share/fonts/custom/ 2>/dev/null || true && \
        fc-cache -f -v; \
    fi && \
    rm -rf /tmp/custom-fonts

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
