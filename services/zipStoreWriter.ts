/**
 * Minimal ZIP writer using STORED (no compression) entries only.
 * - ZipStoreWriter: streams each file to a WritableStream (File System Access API)
 * - buildZipBlobFromParts: assembles a ZIP Blob from pre-CRC'd entries (Blob bodies)
 */

/** PK\x03\x04 */
const LOCAL_FILE_HEADER_SIG = 0x04034b50;
/** PK\x01\x02 */
const CENTRAL_FILE_HEADER_SIG = 0x02014b50;
/** PK\x05\x06 */
const EOCD_SIG = 0x06054b50;

/** IEEE CRC-32 lookup table (256 entries) */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE) — table-based, exported for fallback ZIP assembly */
export function crc32(data: Uint8Array): number {
  let c = ~0 >>> 0;
  for (let i = 0; i < data.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ data[i]) & 0xff];
  }
  return (~c) >>> 0;
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number): void {
  new DataView(buf.buffer, buf.byteOffset + offset, 4).setUint32(0, value, true);
}

function writeUint16LE(buf: Uint8Array, offset: number, value: number): void {
  new DataView(buf.buffer, buf.byteOffset + offset, 2).setUint16(0, value, true);
}

function buildLocalHeader(nameBytes: Uint8Array, crc: number, size: number): Uint8Array {
  const header = new Uint8Array(30 + nameBytes.length);
  writeUint32LE(header, 0, LOCAL_FILE_HEADER_SIG);
  writeUint16LE(header, 4, 20);
  writeUint16LE(header, 6, 0x800);
  writeUint16LE(header, 8, 0);
  writeUint16LE(header, 10, 0);
  writeUint16LE(header, 12, 0);
  writeUint32LE(header, 14, crc);
  writeUint32LE(header, 18, size);
  writeUint32LE(header, 22, size);
  writeUint16LE(header, 26, nameBytes.length);
  writeUint16LE(header, 28, 0);
  header.set(nameBytes, 30);
  return header;
}

function buildCentralEntry(nameBytes: Uint8Array, crc: number, size: number, localOffset: number): Uint8Array {
  const central = new Uint8Array(46 + nameBytes.length);
  writeUint32LE(central, 0, CENTRAL_FILE_HEADER_SIG);
  writeUint16LE(central, 4, 0x0314);
  writeUint16LE(central, 6, 20);
  writeUint16LE(central, 8, 0x800);
  writeUint16LE(central, 10, 0);
  writeUint16LE(central, 12, 0);
  writeUint16LE(central, 14, 0);
  writeUint32LE(central, 16, crc);
  writeUint32LE(central, 20, size);
  writeUint32LE(central, 24, size);
  writeUint16LE(central, 28, nameBytes.length);
  writeUint16LE(central, 30, 0);
  writeUint16LE(central, 32, 0);
  writeUint16LE(central, 34, 0);
  writeUint16LE(central, 36, 0);
  writeUint32LE(central, 38, 0);
  writeUint32LE(central, 42, localOffset);
  central.set(nameBytes, 46);
  return central;
}

function buildEocd(totalEntries: number, centralDirSize: number, centralDirOffset: number): Uint8Array {
  const eocd = new Uint8Array(22);
  writeUint32LE(eocd, 0, EOCD_SIG);
  writeUint16LE(eocd, 4, 0);
  writeUint16LE(eocd, 6, 0);
  writeUint16LE(eocd, 8, totalEntries & 0xffff);
  writeUint16LE(eocd, 10, totalEntries & 0xffff);
  writeUint32LE(eocd, 12, centralDirSize);
  writeUint32LE(eocd, 16, centralDirOffset);
  writeUint16LE(eocd, 20, 0);
  return eocd;
}

// ---------------------------------------------------------------------------
// Streaming writer (for File System Access API)
// ---------------------------------------------------------------------------

export class ZipStoreWriter {
  private position = 0;
  private readonly entries: Array<{
    nameBytes: Uint8Array;
    crc: number;
    size: number;
    localHeaderOffset: number;
  }> = [];

  constructor(private readonly writer: WritableStreamDefaultWriter<Uint8Array>) {}

  async addFile(filename: string, data: Uint8Array): Promise<void> {
    const nameBytes = new TextEncoder().encode(filename.replace(/\\/g, '/'));
    const c = crc32(data);
    const localHeaderOffset = this.position;

    const header = buildLocalHeader(nameBytes, c, data.length);
    await this.writer.write(header);
    this.position += header.length;
    await this.writer.write(data);
    this.position += data.length;

    this.entries.push({ nameBytes, crc: c, size: data.length, localHeaderOffset });
  }

  async finalize(): Promise<void> {
    const centralDirOffset = this.position;
    for (const e of this.entries) {
      const central = buildCentralEntry(e.nameBytes, e.crc, e.size, e.localHeaderOffset);
      await this.writer.write(central);
      this.position += central.length;
    }
    const eocd = buildEocd(this.entries.length, this.position - centralDirOffset, centralDirOffset);
    await this.writer.write(eocd);
    this.position += eocd.length;
    await this.writer.close();
  }
}

// ---------------------------------------------------------------------------
// In-memory builder: pre-computed CRC + Blob per file (no second full scan)
// ---------------------------------------------------------------------------

export function buildZipBlobFromParts(
  entries: Array<{ filename: string; crc: number; data: Blob }>
): Blob {
  const parts: Array<Uint8Array | Blob> = [];
  let offset = 0;
  const meta: Array<{ nameBytes: Uint8Array; crc: number; size: number; localOffset: number }> = [];

  for (const e of entries) {
    const nameBytes = new TextEncoder().encode(e.filename.replace(/\\/g, '/'));
    const size = e.data.size;
    const header = buildLocalHeader(nameBytes, e.crc, size);
    parts.push(header);
    parts.push(e.data);
    meta.push({ nameBytes, crc: e.crc, size, localOffset: offset });
    offset += header.length + size;
  }

  const centralDirOffset = offset;
  for (const m of meta) {
    const central = buildCentralEntry(m.nameBytes, m.crc, m.size, m.localOffset);
    parts.push(central);
    offset += central.length;
  }

  const eocd = buildEocd(meta.length, offset - centralDirOffset, centralDirOffset);
  parts.push(eocd);

  return new Blob(parts, { type: 'application/zip' });
}
