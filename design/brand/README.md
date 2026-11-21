# Coffer Brand Kit

A minimal, square 1:1 identity pack for **Coffer**, the browser-based file manager for S3-compatible object storage.

## Visual direction

- **Mark:** a geometric open `C` surrounding three stacked storage layers. The open form references Coffer; the inner layers suggest objects/files stored in a bucket.
- **Accent teal:** `#1D6B86` (aligned with the repository design token `primitive.teal.600`).
- **Wordmark charcoal:** `#171614` (aligned with the repository neutral palette).
- **Background:** pure white `#FFFFFF`.
- **Primary canvas:** square 1024 × 1024.

## Files

### Main logo and scalable artwork
- `coffer-logo.png` — 1024 × 1024 square logo lockup (mark + wordmark), white background.
- `coffer-app-icon.png` — 1024 × 1024 square symbol-only app icon, white background.
- `public/coffer-logo.svg` — vector logo lockup.
- `public/coffer-mark.svg` — vector symbol-only logo.
- `public/coffer-logo.png`, `public/coffer-mark.png` — matching 1024 px PNG exports.

### Browser and mobile icons
- `public/favicon.svg`, `public/favicon.ico`
- `public/favicon-16x16.png`, `public/favicon-32x32.png`, `public/favicon-48x48.png`
- `public/apple-touch-icon.png` — 180 × 180
- `public/android-chrome-192x192.png`
- `public/android-chrome-512x512.png`
- `public/android-chrome-maskable-512x512.png` and `public/coffer-maskable.svg`
- `public/site.webmanifest`

All exported logo/icon image canvases are square and use a white background.

## Add to this repository

Copy the contents of this kit's `public/` directory into the repository's `public/` directory. Then add the contents of `public/index-html-head-snippet.html` inside the `<head>` element of `index.html` (avoid duplicate favicon or manifest tags if they already exist).

For the logo inside the app UI, reference `/coffer-logo.svg` or `/coffer-mark.svg`. For the browser tab, the SVG favicon is preferred, with the ICO and PNG variants as fallbacks.

## Notes

- SVGs are self-contained. The wordmark letters are converted to vector paths, so no font file is required.
- This is an asset bundle only; it does not modify the GitHub repository automatically.
- `source/generated-concept.png` keeps the original generated concept image for reference. Use the traced SVG artwork for production assets.
