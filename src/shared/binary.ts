/**
 * Little-endian binary reader/writer matching .NET BinaryReader/BinaryWriter
 * conventions used by Slime Rancher 2 save files.
 */

export class SaveParseError extends Error {
  constructor(message: string, public readonly offset: number) {
    super(`${message} (at offset 0x${offset.toString(16)})`);
    this.name = 'SaveParseError';
  }
}

export class BinaryReader {
  private view: DataView;
  pos = 0;

  constructor(public readonly bytes: Uint8Array, pos = 0) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
  }

  get length(): number {
    return this.bytes.length;
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.length) {
      throw new SaveParseError(`unexpected end of file, need ${n} bytes`, this.pos);
    }
  }

  u8(): number {
    this.need(1);
    return this.bytes[this.pos++];
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  i64(): bigint {
    this.need(8);
    const v = this.view.getBigInt64(this.pos, true);
    this.pos += 8;
    return v;
  }

  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.need(8);
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  /** Raw bytes (copy). */
  bytesN(n: number): Uint8Array {
    this.need(n);
    const out = this.bytes.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** .NET BinaryWriter string: 7-bit encoded length prefix + UTF-8 bytes. */
  str(): string {
    let len = 0;
    let shift = 0;
    let c: number;
    do {
      c = this.u8();
      len |= (c & 0x7f) << shift;
      shift += 7;
    } while (c & 0x80);
    this.need(len);
    const s = new TextDecoder('utf-8').decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }

  expect(...expected: number[]): void {
    for (const e of expected) {
      const got = this.u8();
      if (got !== e) {
        throw new SaveParseError(`expected byte 0x${e.toString(16)} but found 0x${got.toString(16)}`, this.pos - 1);
      }
    }
  }

  peek(n: number): Uint8Array {
    return this.bytes.subarray(this.pos, this.pos + n);
  }
}

export class BinaryWriter {
  private chunks: Uint8Array[] = [];
  private size = 0;

  get length(): number {
    return this.size;
  }

  private push(chunk: Uint8Array): void {
    this.chunks.push(chunk);
    this.size += chunk.length;
  }

  u8(v: number): void {
    this.push(new Uint8Array([v & 0xff]));
  }

  bool(v: boolean): void {
    this.u8(v ? 1 : 0);
  }

  i32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v | 0, true);
    this.push(b);
  }

  i64(v: bigint): void {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigInt64(0, v, true);
    this.push(b);
  }

  f32(v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    this.push(b);
  }

  f64(v: number): void {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    this.push(b);
  }

  bytes(b: Uint8Array): void {
    this.push(b);
  }

  str(s: string): void {
    const enc = new TextEncoder().encode(s);
    let len = enc.length;
    do {
      let byte = len & 0x7f;
      len >>= 7;
      if (len > 0) byte |= 0x80;
      this.u8(byte);
    } while (len > 0);
    this.push(enc);
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

export function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let k = 0; k < needle.length; k++) {
      if (hay[i + k] !== needle[k]) continue outer;
    }
    return i;
  }
  return -1;
}
