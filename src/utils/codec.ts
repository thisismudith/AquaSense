/** Dependency-free UTF-8 and base64 codecs (Hermes has no Buffer; BLE libraries exchange base64). */

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

/** Strict decoder: throws on malformed sequences so corrupt packets are detected. */
export function utf8Decode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const c = b[i]!;
    let cp: number;
    let need: number;
    if (c < 0x80) {
      cp = c;
      need = 0;
    } else if (c >= 0xc2 && c < 0xe0) {
      cp = c & 31;
      need = 1;
    } else if (c >= 0xe0 && c < 0xf0) {
      cp = c & 15;
      need = 2;
    } else if (c >= 0xf0 && c < 0xf5) {
      cp = c & 7;
      need = 3;
    } else throw new Error(`Invalid UTF-8 lead byte at ${i}`);
    for (let k = 1; k <= need; k++) {
      const n = b[i + k];
      if (n === undefined) throw new Error('Truncated UTF-8 sequence');
      if ((n & 0xc0) !== 0x80) throw new Error(`Invalid UTF-8 continuation at ${i + k}`);
      cp = (cp << 6) | (n & 63);
    }
    if ((need === 2 && (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff))) || (need === 3 && (cp < 0x10000 || cp > 0x10ffff))) {
      throw new Error(`Invalid UTF-8 code point at ${i}`);
    }
    i += need + 1;
    s += String.fromCodePoint(cp);
  }
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64Encode(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < b.length ? B64[(n >> 6) & 63]! : '=') + (i + 2 < b.length ? B64[n & 63]! : '=');
  }
  return s;
}

export function base64Decode(s: string): Uint8Array {
  const clean = s.replace(/[\r\n\s]/g, '');
  if (clean.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(clean) || /=[^=]/.test(clean)) throw new Error('Invalid base64');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((clean.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (clean[i + k] === '=' ? 0 : B64_LOOKUP[clean.charCodeAt(i + k)]!));
    const n = (v[0]! << 18) | (v[1]! << 12) | (v[2]! << 6) | v[3]!;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
