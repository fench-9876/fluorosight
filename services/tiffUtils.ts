/**
 * TIFF decode/encode via utif2 (Photopea UTIF.js fork).
 */
import UTIF from 'utif2';

export interface DecodedTiff {
  width: number;
  height: number;
  /** RGBA8, length = width * height * 4 */
  rgba: Uint8Array;
}

type UtifIfd = Record<string, number[] | undefined> & {
  width?: number;
  height?: number;
  subIFD?: UtifIfd[];
};

/**
 * Decode first/largest RGB(A) page from a TIFF buffer to RGBA8.
 * Page selection mirrors utif2's bufferToURI helper.
 */
export function decodeTiff(buffer: ArrayBuffer): DecodedTiff {
  const ifds = UTIF.decode(buffer) as UtifIfd[];
  if (!ifds || ifds.length === 0) {
    throw new Error('Invalid or empty TIFF');
  }

  let vsns: UtifIfd[] = ifds;
  if (ifds[0]?.subIFD) {
    vsns = vsns.concat(ifds[0].subIFD);
  }

  let page: UtifIfd = ifds[0];
  let maxArea = 0;
  for (let i = 0; i < vsns.length; i++) {
    const img = vsns[i];
    if (!img.t258 || img.t258.length < 3) continue;
    const ar = (img.t256?.[0] ?? 0) * (img.t257?.[0] ?? 0);
    if (ar > maxArea) {
      maxArea = ar;
      page = img;
    }
  }

  UTIF.decodeImage(buffer, page, ifds);
  const rgba = UTIF.toRGBA8(page) as Uint8Array;
  const width = page.width as number;
  const height = page.height as number;

  return { width, height, rgba };
}

/**
 * Encode RGBA8 pixels to an uncompressed TIFF file buffer.
 */
export function encodeTiff(rgba: Uint8ClampedArray, w: number, h: number): ArrayBuffer {
  return UTIF.encodeImage(rgba, w, h) as ArrayBuffer;
}
