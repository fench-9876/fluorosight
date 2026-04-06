
import { ProcessingParams, ColorMapType } from '../types';
import { COLOR_MAPS } from '../constants';

/**
 * Advanced Fluorescent Image Processor
 * Uses deterministic algorithms to isolate and amplify cell signals.
 */
export const processImageData = (
  originalData: Uint8ClampedArray,
  width: number,
  height: number,
  params: ProcessingParams
): Uint8ClampedArray => {
  const size = width * height;
  let intensities = new Float32Array(size);
  const { 
    brightness, contrast, gamma, blackPoint, whitePoint, 
    bgSubtraction, signalBoost, outlineEnhance, selectiveGain, gainThreshold, 
    sharpness, denoise, colorMap 
  } = params;

  // 1. Initial Intensity Extraction
  for (let i = 0; i < size; i++) {
    const idx = i * 4;
    intensities[i] = (originalData[idx] + originalData[idx + 1] + originalData[idx + 2]) / 3;
  }

  // 2. Refined Denoising (3x3 Box + Median Hybrid for smoothness)
  if (denoise > 0) {
    const temp = new Float32Array(intensities);
    const weight = denoise / 100;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        // Simple smoothing to reduce "pixel dots"
        const avg = (
          temp[i-width-1] + temp[i-width] + temp[i-width+1] + 
          temp[i-1] + temp[i] + temp[i+1] + 
          temp[i+width-1] + temp[i+width] + temp[i+width+1]
        ) / 9;
        intensities[i] = temp[i] * (1 - weight) + avg * weight;
      }
    }
  }

  // 3. Smooth Background Subtraction (Separable 2D Box Blur)
  if (bgSubtraction > 0) {
    const radius = Math.max(2, Math.floor(bgSubtraction / 4));
    const hBlur = new Float32Array(size);
    const fullBlur = new Float32Array(size);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, count = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width) {
            sum += intensities[y * width + nx];
            count++;
          }
        }
        hBlur[y * width + x] = sum / count;
      }
    }

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let sum = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < height) {
            sum += hBlur[ny * width + x];
            count++;
          }
        }
        fullBlur[y * width + x] = sum / count;
      }
    }

    for (let i = 0; i < size; i++) {
      intensities[i] = Math.max(0, intensities[i] - fullBlur[i]);
    }
  }

  // 4. Selective Signal Gain (Linear Excess Model)
  if (selectiveGain > 0) {
    const factor = selectiveGain / 25;
    const kneeWidth = 5;
    for (let i = 0; i < size; i++) {
      const v = intensities[i];
      if (v > gainThreshold) {
        const weight = Math.min(1, (v - gainThreshold) / kneeWidth);
        const excess = v - gainThreshold;
        intensities[i] = v + (excess * factor * weight);
      }
    }
  }

  // 5. Signal Boost (Logarithmic transformation)
  if (signalBoost > 0) {
    const factor = signalBoost / 10;
    for (let i = 0; i < size; i++) {
      const norm = intensities[i] / 255;
      if (norm > 0) {
        intensities[i] = 255 * (Math.log(1 + factor * norm) / Math.log(1 + factor));
      }
    }
  }

  // 6. Smoother Outline Enhancement
  if (outlineEnhance > 0) {
    const temp = new Float32Array(intensities);
    const weight = outlineEnhance / 50;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        // Edge detection with local neighborhood subtraction
        const edge = (temp[i] * 8) - (
          temp[i-width-1] + temp[i-width] + temp[i-width+1] +
          temp[i-1] + temp[i+1] +
          temp[i+width-1] + temp[i+width] + temp[i+width+1]
        );
        // Only add positive edges (peaks) to avoid subtractive dots
        intensities[i] = Math.max(0, temp[i] + Math.max(0, edge) * weight);
      }
    }
  }

  // 7. Sharpening
  if (sharpness > 0) {
    const temp = new Float32Array(intensities);
    const s = sharpness / 50;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const laplacian = temp[i] * 5 - temp[i-width] - temp[i-1] - temp[i+1] - temp[i+width];
        intensities[i] = Math.max(0, temp[i] + laplacian * s);
      }
    }
  }

  // 8. Final LUT for Contrast, Gamma, and Levels
  const lut = new Uint8ClampedArray(256);
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const range = Math.max(1, whitePoint - blackPoint);

  for (let i = 0; i < 256; i++) {
    let v = ((i - blackPoint) / range) * 255;
    v = Math.max(0, Math.min(255, v));
    v = 255 * Math.pow(v / 255, 1 / gamma);
    v = contrastFactor * (v - 128) + 128 + brightness;
    lut[i] = Math.max(0, Math.min(255, v));
  }

  // 9. Output Mapping
  const outputData = new Uint8ClampedArray(originalData.length);
  const mapper = COLOR_MAPS[colorMap];
  const preserveOriginal = colorMap === ColorMapType.ORIGINAL;
  const lumEps = 1;
  const maxScale = 256;

  for (let i = 0; i < size; i++) {
    const val = Math.max(0, Math.min(255, intensities[i]));
    const corrected = lut[Math.floor(val)];
    const outIdx = i * 4;

    if (preserveOriginal) {
      const r0 = originalData[outIdx];
      const g0 = originalData[outIdx + 1];
      const b0 = originalData[outIdx + 2];
      const lIn = (r0 + g0 + b0) / 3;
      if (lIn < lumEps) {
        outputData[outIdx] = 0;
        outputData[outIdx + 1] = 0;
        outputData[outIdx + 2] = 0;
      } else {
        const scale = Math.min(maxScale, corrected / lIn);
        outputData[outIdx] = Math.max(0, Math.min(255, Math.round(r0 * scale)));
        outputData[outIdx + 1] = Math.max(0, Math.min(255, Math.round(g0 * scale)));
        outputData[outIdx + 2] = Math.max(0, Math.min(255, Math.round(b0 * scale)));
      }
    } else {
      const [r, g, b] = mapper(corrected);
      outputData[outIdx] = r;
      outputData[outIdx + 1] = g;
      outputData[outIdx + 2] = b;
    }
    outputData[outIdx + 3] = 255;
  }

  return outputData;
};

export const getHistogram = (data: Uint8ClampedArray): number[] => {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const intensity = Math.floor((data[i] + data[i + 1] + data[i + 2]) / 3);
    hist[intensity]++;
  }
  return hist;
};
