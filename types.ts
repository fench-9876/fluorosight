
export interface ProcessingParams {
  brightness: number;
  contrast: number;
  gamma: number;
  blackPoint: number;
  whitePoint: number;
  sharpness: number;
  denoise: number;
  bgSubtraction: number;
  signalBoost: number;
  outlineEnhance: number;
  selectiveGain: number;
  gainThreshold: number;
  colorMap: ColorMapType;
}

export enum ColorMapType {
  ORIGINAL = 'original',
  GRAYSCALE = 'grayscale',
  VIRIDIS = 'viridis',
  MAGMA = 'magma',
  CYAN = 'cyan',
  GREEN = 'green',
  RED = 'red',
  YELLOW = 'yellow',
  // Fixed casing of INFERNO to match constants.tsx implementation
  INFERNO = 'inferno'
}

export interface HistogramData {
  bin: number;
  count: number;
}
