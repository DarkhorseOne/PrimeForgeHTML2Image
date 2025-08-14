# Custom Fonts Directory

Place any custom `.ttf`, `.otf`, `.woff`, or `.woff2` font files in this directory.

They will be automatically copied to the Docker image during build.

## Recommended Fonts for Web Design:

- **Sans-serif**: Inter, Helvetica, Arial, Roboto, Open Sans
- **Serif**: Georgia, Times New Roman, Playfair Display
- **Monospace**: Fira Code, Source Code Pro, Monaco
- **Display**: Montserrat, Poppins, Bebas Neue

## Fonts Already Included in Docker Image:

- Noto (complete family including CJK)
- Noto Color Emoji
- Liberation fonts
- DejaVu fonts
- Roboto
- Ubuntu
- Open Sans
- Lato
- Fira Code
- Inter (from Google Fonts)
- Poppins (from Google Fonts)
- Source Sans Pro (from Google Fonts)
- Montserrat (from Google Fonts)
- Playfair Display (from Google Fonts)

## Adding Custom Fonts:

1. Place font files in this directory
2. Rebuild the Docker image: `docker-compose build`
3. The fonts will be available in your templates