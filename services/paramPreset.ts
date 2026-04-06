import { INITIAL_PARAMS } from '../constants';
import { ColorMapType, ProcessingParams } from '../types';

export const PRESET_FILE_VERSION = 1;

const VALID_COLOR_MAPS = new Set<string>(Object.values(ColorMapType));

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function readNumber(
  src: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  const v =
    typeof src === 'number' && Number.isFinite(src)
      ? src
      : typeof src === 'string'
        ? Number(src)
        : NaN;
  if (!Number.isFinite(v)) return fallback;
  return clamp(v, min, max);
}

function readColorMap(src: unknown): ColorMapType {
  if (typeof src !== 'string' || !VALID_COLOR_MAPS.has(src)) {
    return INITIAL_PARAMS.colorMap;
  }
  return src as ColorMapType;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extractParamsRoot(parsed: unknown): Record<string, unknown> | null {
  if (!isPlainObject(parsed)) return null;
  const paramsVal = parsed.params;
  if (isPlainObject(paramsVal)) return paramsVal;
  return parsed;
}

export function buildPresetPayload(params: ProcessingParams): string {
  return JSON.stringify(
    {
      fluorosightPresetVersion: PRESET_FILE_VERSION,
      params,
    },
    null,
    2
  );
}

export function parsePresetJson(text: string): ProcessingParams | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }

  const root = extractParamsRoot(parsed);
  if (!root) return null;

  const p = INITIAL_PARAMS;

  return {
    brightness: readNumber(root.brightness, p.brightness, -200, 200),
    contrast: readNumber(root.contrast, p.contrast, -200, 200),
    gamma: readNumber(root.gamma, p.gamma, 0.01, 5.0),
    blackPoint: readNumber(root.blackPoint, p.blackPoint, 0, 255),
    whitePoint: readNumber(root.whitePoint, p.whitePoint, 0, 255),
    sharpness: readNumber(root.sharpness, p.sharpness, 0, 100),
    denoise: readNumber(root.denoise, p.denoise, 0, 100),
    bgSubtraction: readNumber(root.bgSubtraction, p.bgSubtraction, 0, 500),
    signalBoost: readNumber(root.signalBoost, p.signalBoost, 0, 200),
    outlineEnhance: readNumber(root.outlineEnhance, p.outlineEnhance, 0, 100),
    selectiveGain: readNumber(root.selectiveGain, p.selectiveGain, 0, 500),
    gainThreshold: readNumber(root.gainThreshold, p.gainThreshold, 0, 150),
    colorMap: readColorMap(root.colorMap),
  };
}
