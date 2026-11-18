import { BLE_PROTOCOL } from '@/config/ble';
import { utf8Decode, utf8Encode } from '@/utils/codec';

export type FrameEvent = { kind: 'frame'; text: string } | { kind: 'corrupt'; reason: string };

/**
 * Reassembles newline-delimited frames from arbitrarily fragmented notifications.
 * Decodes UTF-8 only on complete frames (0x0A never occurs inside a multi-byte sequence).
 * Oversized frames are discarded up to the next delimiter and reported as corrupt.
 */
export class FrameAssembler {
  private buf: number[] = [];
  private overflow = false;
  private lastByteAt = 0;

  constructor(
    private readonly maxBytes: number = BLE_PROTOCOL.maxFrameBytes,
    private readonly delimiter: number = BLE_PROTOCOL.frameDelimiter,
    private readonly staleMs: number = BLE_PROTOCOL.staleFrameMs,
    private readonly now: () => number = Date.now,
  ) {}

  push(chunk: Uint8Array): FrameEvent[] {
    const out: FrameEvent[] = [];
    const t = this.now();
    if ((this.buf.length || this.overflow) && t - this.lastByteAt > this.staleMs) {
      out.push({ kind: 'corrupt', reason: 'stale_partial_frame' });
      this.buf = [];
      this.overflow = false;
    }
    if (chunk.length) this.lastByteAt = t;
    for (const byte of chunk) {
      if (byte === this.delimiter) {
        if (this.overflow) out.push({ kind: 'corrupt', reason: 'frame_too_large' });
        else if (this.buf.length) {
          try {
            const text = utf8Decode(Uint8Array.from(this.buf)).replace(/\r$/, '');
            if (text.trim()) out.push({ kind: 'frame', text });
          } catch (e) {
            out.push({ kind: 'corrupt', reason: e instanceof Error ? e.message : 'decode_error' });
          }
        }
        this.buf = [];
        this.overflow = false;
        continue;
      }
      if (this.overflow) continue;
      this.buf.push(byte);
      if (this.buf.length > this.maxBytes) {
        this.overflow = true;
        this.buf = [];
      }
    }
    return out;
  }

  /** Bytes waiting for a delimiter (partial frame). */
  get pending(): number {
    return this.buf.length;
  }

  reset(): void {
    this.buf = [];
    this.overflow = false;
  }
}

/** Encodes a frame and splits it into chunks of at most `mtu − 3` bytes. */
export function encodeFrame(text: string, mtu: number): Uint8Array[] {
  const bytes = utf8Encode(`${text}\n`);
  const size = Math.max(1, mtu - 3);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.slice(i, i + size));
  return chunks;
}
