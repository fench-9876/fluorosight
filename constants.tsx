
import { ColorMapType } from './types';

export const INITIAL_PARAMS = {
  brightness: 0,
  contrast: 0,
  gamma: 1.0,
  blackPoint: 0,
  whitePoint: 255,
  sharpness: 0,
  denoise: 0,
  bgSubtraction: 0,
  signalBoost: 0,
  outlineEnhance: 0,
  selectiveGain: 0,
  gainThreshold: 10,
  colorMap: ColorMapType.GREEN
};

export const COLOR_MAPS: Record<ColorMapType, (v: number) => [number, number, number]> = {
  [ColorMapType.GRAYSCALE]: (v) => [v, v, v],
  [ColorMapType.GREEN]: (v) => [0, v, 0],
  [ColorMapType.RED]: (v) => [v, 0, 0],
  [ColorMapType.CYAN]: (v) => [0, v, v],
  [ColorMapType.YELLOW]: (v) => [v, v, 0],
  [ColorMapType.VIRIDIS]: (v) => {
    const f = v / 255;
    return [
      Math.floor(255 * (0.267 + 0.672 * f)),
      Math.floor(255 * (0.004 + 0.922 * f)),
      Math.floor(255 * (0.329 + 0.174 * f))
    ];
  },
  [ColorMapType.MAGMA]: (v) => {
    const f = v / 255;
    return [
      Math.floor(255 * Math.pow(f, 0.4)),
      Math.floor(255 * Math.pow(f, 1.2)),
      Math.floor(255 * (0.2 + 0.5 * f))
    ];
  },
  [ColorMapType.INFERNO]: (v) => {
    const f = v / 255;
    return [
      Math.floor(255 * Math.pow(f, 0.5)),
      Math.floor(255 * Math.pow(f, 1.5)),
      Math.floor(128 * Math.pow(f, 3))
    ];
  }
};
