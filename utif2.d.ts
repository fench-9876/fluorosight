declare module 'utif2' {
  const UTIF: {
    decode: (buff: ArrayBuffer) => unknown[];
    decodeImage: (buff: ArrayBuffer, img: unknown, ifds: unknown[]) => void;
    toRGBA8: (out: unknown, scl?: number) => Uint8Array;
    encodeImage: (rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, metadata?: unknown) => ArrayBuffer;
  };
  export default UTIF;
}
