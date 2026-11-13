/**
 * Deterministic remote row IDs.
 *
 * Create-once entities (orders, bills and their items) derive row IDs from the
 * Mutation's `mutationId`, so every retry targets the same rows. Products and
 * customers use their entity id directly (see `entityRowId`).
 *
 * Appwrite custom IDs: at most 36 chars of `a-z A-Z 0-9 . - _`, and the first
 * char must not be special. A UUID satisfies this.
 */

/** Fixed project namespace for UUIDv5 derivation. */
export const NS = '6f1c9a0e-2f3b-5c6d-8e7f-0a1b2c3d4e5f';

export const APPWRITE_ID_MAX_LENGTH = 36;
const APPWRITE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/;

/** The minimal Mutation shape row-ID derivation depends on. */
export interface MutationIdentity {
  readonly mutationId: string;
}

export function isValidAppwriteId(id: string): boolean {
  return APPWRITE_ID_PATTERN.test(id);
}

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

/** Pure synchronous SHA-1 (required by UUIDv5). */
function sha1(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const paddedLen = (((data.length + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) {
      w[i] = rotl((w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!) >>> 0, 1);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + (f >>> 0) + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h, false));
  return out;
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error('Invalid UUID namespace');
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** RFC 4122 UUIDv5 (lowercase, 36 chars). */
export function uuidV5(name: string, namespace: string = NS): string {
  const nameBytes = new TextEncoder().encode(name);
  const nsBytes = uuidToBytes(namespace);
  const input = new Uint8Array(nsBytes.length + nameBytes.length);
  input.set(nsBytes);
  input.set(nameBytes, nsBytes.length);
  const hash = sha1(input).slice(0, 16);
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Header row (order or bill): the mutationId itself. */
export const headerRowId = (m: MutationIdentity): string => m.mutationId;

/** Item row (order_items or bill_items): UUIDv5 of `${mutationId}:item:${index}`. */
export const itemRowId = (m: MutationIdentity, index: number): string =>
  uuidV5(`${m.mutationId}:item:${index}`, NS);

/** Mutable entities (products, customers) use their entity id as the row id. */
export const entityRowId = (entityId: string): string => entityId;
