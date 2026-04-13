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

/** JPEG blob URL for gallery thumbnails (avoids large base64 strings on the JS heap). */
async function canvasToJpegObjectUrl(canvas: HTMLCanvasElement, quality = 0.85): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  );
  return blob ? URL.createObjectURL(blob) : '';
}

/**
 * Decode file to ImageBitmap. TIFF uses utif2 with native fallback; others use createImageBitmap.
 */
export async function decodeImageFile(
  file: File,
  format: ImageFormat
): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  if (format === 'tiff') {
    try {
      const buffer = await file.arrayBuffer();
      const { width, height, rgba } = decodeTiff(buffer);
      const copy = new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength);
      const imageData = new ImageData(copy, width, height);
      const bitmap = await createImageBitmap(imageData);
      return { bitmap, width, height };
    } catch {
      // utif2 can't handle this TIFF variant; try native browser decode
      // (works on Edge/Safari which have system TIFF codecs)
      const bitmap = await createImageBitmap(file);
      return { bitmap, width: bitmap.width, height: bitmap.height };
    }
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
 * Gallery thumbnail (JPEG blob URL) + original file object URL for display metadata.
 * TIFF RAW preview is loaded lazily in the app (see generateTiffRawDisplayUrl).
 */
export async function generateThumbnail(
  file: File,
  format: ImageFormat,
  objectUrl: string
): Promise<{
  thumbnailUrl: string;
  displayUrl: string;
  width: number;
  height: number;
}> {
  const { bitmap, width, height } = await decodeImageFile(file, format);
  try {
    const thumb = drawBitmapToCanvas(bitmap, THUMBNAIL_MAX_EDGE);
    const thumbnailUrl = await canvasToJpegObjectUrl(thumb.canvas, 0.82);
    return { thumbnailUrl, displayUrl: objectUrl, width, height };
  } finally {
    bitmap.close();
  }
}

/**
 * Lazy PNG blob URL for TIFF RAW panel (browser cannot use blob: file URL for many TIFFs).
 */
export async function generateTiffRawDisplayUrl(file: File, previewMaxEdge: number): Promise<string> {
  const { bitmap } = await decodeImageFile(file, 'tiff');
  try {
    const disp = drawBitmapToCanvas(bitmap, previewMaxEdge);
    const blob = await new Promise<Blob | null>((resolve) =>
      disp.canvas.toBlob((b) => resolve(b), 'image/png')
    );
    return blob ? URL.createObjectURL(blob) : '';
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
 * Falls back to bitmap/canvas if utif2 can't handle the TIFF variant.
 */
export async function loadFullImageData(
  file: File,
  format: ImageFormat,
  width: number,
  height: number
): Promise<ImageData | null> {
  if (format === 'tiff') {
    try {
      const buffer = await file.arrayBuffer();
      const { width: tw, height: th, rgba } = decodeTiff(buffer);
      return new ImageData(
        new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength),
        tw,
        th
      );
    } catch {
      // fall through to bitmap/canvas path
    }
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

async function blobToUint8(blob: Blob): Promise<Uint8Array> {
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

/**
 * Encode processed RGBA buffer to the same family as the original upload.
 * Returns raw bytes for ZIP packaging (no Blob wrapper — avoids extra copies in export).
 */
export async function encodeProcessedImage(
  processedPixels: Uint8ClampedArray,
  width: number,
  height: number,
  format: ImageFormat
): Promise<{ data: Uint8Array; ext: string }> {
  if (format === 'tiff') {
    const ab = encodeTiff(processedPixels, width, height);
    return { data: new Uint8Array(ab), ext: '.tif' };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const ab = encodeTiff(processedPixels, width, height);
    return { data: new Uint8Array(ab), ext: '.tif' };
  }
  const imageData = new ImageData(processedPixels, width, height);
  ctx.putImageData(imageData, 0, 0);

  if (format === 'jpeg') {
    const jpg = await canvasBlob(canvas, 'image/jpeg', 0.95);
    if (jpg) return { data: await blobToUint8(jpg), ext: '.jpg' };
    const png = await canvasBlob(canvas, 'image/png');
    return { data: await blobToUint8(png!), ext: '.png' };
  }
  const blob = await canvasBlob(canvas, 'image/png');
  return { data: await blobToUint8(blob!), ext: '.png' };
}

export function exportBasename(name: string, ext: string): string {
  const base = name.replace(/\.[^/.]+$/, '');
  return `${base}_enhanced${ext}`;
}
