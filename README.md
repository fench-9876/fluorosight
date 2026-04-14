# FluoroSight

**FluoroSight** is a browser-based tool for batch-enhancing fluorescence and cell microscopy images. It applies the same adjustable pipeline to every image in a session: denoising, background subtraction, selective gain, pseudo-color maps, and classic tone controls—all processed locally in the browser with no server round-trip for the core workflow.

## Features

- **Batch workflow** — Upload multiple images; switch between them with the thumbnail strip while keeping one shared parameter set.
- **Raw vs enhanced** — Split view compares the original image with the processed canvas output; single view shows only the enhanced result.
- **Signal analyzer** — Right-hand panel with sliders for every processing stage and a one-click reset to defaults.
- **Histogram and stats** — Intensity distribution chart (Recharts), mean intensity, and peak level for the current enhanced frame.
- **Export** — Download all loaded images as PNGs inside a single ZIP (`*_enhanced.png`), using the current parameters.
- **Focus mode** — Full-screen workspace for reviewing images with fewer chrome distractions.

## Tech stack

| Layer | Choice |
|--------|--------|
| UI | React 19, TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS (CDN), Font Awesome 6 (CDN) |
| Charts | Recharts |
| Archives | JSZip |

The dev server is configured for port **3000** and host `0.0.0.0` (see `vite.config.ts`).

## Project layout

| Path | Role |
|------|------|
| `App.tsx` | Root layout: uploads, gallery, viewer (split/single), focus mode, ZIP export, wiring of state to `Controls` and `Histogram`. |
| `components/Controls.tsx` | “Signal analyzer” sidebar: grouped sliders, color-map buttons, reset. |
| `components/Histogram.tsx` | Bar chart of 256-bin intensity counts for the enhanced image. |
| `services/imageUtils.ts` | Pixel pipeline: `processImageData`, `getHistogram`. |
| `types.ts` | `ProcessingParams`, `ColorMapType`. |
| `constants.tsx` | `INITIAL_PARAMS` and `COLOR_MAPS` LUTs for pseudo-color. |
| `index.tsx` | React mount. |
| `index.html` | Document shell, Tailwind/Font Awesome, entry script. |

## Processing pipeline (`processImageData`)

Processing runs on **grayscale intensity** derived from RGB (average of channels), then maps the result through a pseudo-color LUT. Stages (when their sliders are above zero) are applied in order:

1. **Denoise** — 3×3 neighborhood smoothing blended with the original.
2. **Background subtraction** — Separable box blur estimate subtracted from intensity.
3. **Selective gain** — Extra gain for pixels above **Gain threshold** (knee-shaped blend).
4. **Signal boost** — Log-style stretch for dim signal.
5. **Outline enhance** — Local edge emphasis on positive contrasts.
6. **Sharpen** — Laplacian-style sharpening.
7. **Levels / gamma / contrast / brightness** — Single 256-entry LUT (black/white points, gamma, contrast, brightness offset).
8. **Color map** — Maps final intensity to RGB via `COLOR_MAPS` (grayscale, green, red, cyan, yellow, Viridis, Magma, Inferno).

`getHistogram` builds a 256-bin count array from the **enhanced** RGB output (mean of R, G, B per pixel).

## Usage

### Prerequisites

- [Node.js](https://nodejs.org/) (current LTS recommended)

### Install and run (development)

```bash
npm install
npm run dev
```

Open the URL Vite prints (by default **http://localhost:3000**).

### Typical workflow

1. Click **Upload** (sidebar `+` or empty-state button) and select one or more images (`image/*`).
2. Choose an image in the bottom **gallery** strip; the enhanced view updates immediately when you move sliders.
3. Use **split / single** toggle to compare raw vs enhanced or focus on enhanced only.
4. Optional: **Focus mode** (expand) for a larger workspace; use the overlay control to exit.
5. **Export** (archive icon) saves a ZIP of all loaded images processed with the **current** settings.

**Reset Params** restores defaults from `INITIAL_PARAMS` in `constants.tsx` (including default pseudo-color **green**).

### Production build

```bash
npm run build
npm run preview
```

`npm run build` writes static assets to `dist/`; serve that folder with any static host.


## Scripts (`package.json`)

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Development server with HMR |
| `build` | `vite build` | Optimized production bundle |
| `preview` | `vite preview` | Local preview of the production build |


