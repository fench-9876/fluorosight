import { decodeTiff, encodeTiff } from './tiffUtils';

export type ImageFormat = 'tiff' | 'png' | 'jpeg' | 'other';

export const THUMBNAIL_MAX_EDGE = 128;

export function detectFormat(file: File): ImageFormat {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'tif' || ext === 'tiff') return 'tiff';
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (file.type === 'image/tiff') return 'tiff';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/jpeg') return 'jpeg';
  return 'other';
}

export type ImagePreview = {
  original: ImageData;
  width: number;
  height: number;
};

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Decode file to ImageBitmap. TIFF uses utif2; others use createImageBitmap.
 */
export async function decodeImageFile(
  file: File,
  format: ImageFormat
): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  if (format === 'tiff') {
    const buffer = await file.arrayBuffer();
    const { width, height, rgba } = decodeTiff(buffer);
    const copy = new Uint8ClampedArray(rgba);
    const imageData = new ImageData(copy, width, height);
    const bitmap = await createImageBitmap(imageData);
    return { bitmap, width, height };
  }

  const bitmap = await createImageBitmap(file);
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

function drawBitmapToCanvas(
  bitmap: ImageBitmap,
  maxEdge: number
): { canvas: HTMLCanvasElement; outW: number; outH: number } {
  const w = bitmap.width;
  const h = bitmap.height;
  if (w <= 0 || h <= 0) {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return { canvas: c, outW: 1, outH: 1 };
  }
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return { canvas, outW, outH };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, outW, outH);
  return { canvas, outW, outH };
}

/**
 * Gallery thumbnail (JPEG data URL) + display URL for RAW panel.
 * For TIFF, displayUrl is a PNG object URL at preview resolution.
 */
export async function generateThumbnail(
  file: File,
  format: ImageFormat,
  objectUrl: string,
  previewMaxEdge: number
): Promise<{
  thumbnailUrl: string;
  displayUrl: string;
  width: number;
  height: number;
}> {
  const { bitmap, width, height } = await decodeImageFile(file, format);
  try {
    const thumb = drawBitmapToCanvas(bitmap, THUMBNAIL_MAX_EDGE);
    const thumbnailUrl = canvasToJpegDataUrl(thumb.canvas, 0.82);

    let displayUrl: string;
    if (format === 'tiff') {
      const disp = drawBitmapToCanvas(bitmap, previewMaxEdge);
      const blob = await new Promise<Blob | null>((resolve) =>
        disp.canvas.toBlob((b) => resolve(b), 'image/png')
      );
      displayUrl = blob ? URL.createObjectURL(blob) : objectUrl;
    } else {
      displayUrl = objectUrl;
    }

    return { thumbnailUrl, displayUrl, width, height };
  } finally {
    bitmap.close();
  }
}

/**
 * Downscaled preview ImageData for interactive processing.
 */
export async function generatePreviewFromFile(
  file: File,
  format: ImageFormat,
  maxEdge: number
): Promise<ImagePreview> {
  const { bitmap } = await decodeImageFile(file, format);
  try {
    const { canvas, outW, outH } = drawBitmapToCanvas(bitmap, maxEdge);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return { original: new ImageData(1, 1), width: 1, height: 1 };
    }
    const original = ctx.getImageData(0, 0, outW, outH);
    return { original, width: outW, height: outH };
  } finally {
    bitmap.close();
  }
}

/**
 * Full-resolution ImageData for export.
 * TIFF fast-path: returns decoded RGBA directly without bitmap/canvas round-trip.
 */
export async function loadFullImageData(
  file: File,
  format: ImageFormat,
  width: number,
  height: number
): Promise<ImageData | null> {
  if (format === 'tiff') {
    const buffer = await file.arrayBuffer();
    const { width: tw, height: th, rgba } = decodeTiff(buffer);
    return new ImageData(new Uint8ClampedArray(rgba), tw, th);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (type === 'image/jpeg') {
      canvas.toBlob((b) => resolve(b), type, quality ?? 0.95);
    } else {
      canvas.toBlob((b) => resolve(b), type);
    }
  });
}

/**
 * Encode processed RGBA buffer to the same family as the original upload.
 * `alreadyCompressed` indicates the output is already internally compressed
 * (PNG/JPEG) so the caller can skip zip-level DEFLATE.
 */
export async function encodeProcessedImage(
  processedPixels: Uint8ClampedArray,
  width: number,
  height: number,
  format: ImageFormat
): Promise<{ data: Blob | ArrayBuffer; ext: string; alreadyCompressed: boolean }> {
  if (format === 'tiff') {
    return { data: encodeTiff(processedPixels, width, height), ext: '.tif', alreadyCompressed: false };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { data: encodeTiff(processedPixels, width, height), ext: '.tif', alreadyCompressed: false };
  }
  const imageData = new ImageData(processedPixels, width, height);
  ctx.putImageData(imageData, 0, 0);

  if (format === 'jpeg') {
    const jpg = await canvasBlob(canvas, 'image/jpeg', 0.95);
    if (jpg) return { data: jpg, ext: '.jpg', alreadyCompressed: true };
    const png = await canvasBlob(canvas, 'image/png');
    return { data: png!, ext: '.png', alreadyCompressed: true };
  }
  const blob = await canvasBlob(canvas, 'image/png');
  return { data: blob!, ext: '.png', alreadyCompressed: true };
}

export function exportBasename(name: string, ext: string): string {
  const base = name.replace(/\.[^/.]+$/, '');
  return `${base}_enhanced${ext}`;
}
