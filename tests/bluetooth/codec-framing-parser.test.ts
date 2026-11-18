import { parseDeviceFrame, toNewTestResult } from '@/services/bluetooth/BLEDataParser';
import { encodeFrame, FrameAssembler } from '@/services/bluetooth/BLEFraming';
import { base64Decode, base64Encode, utf8Decode, utf8Encode } from '@/utils/codec';

describe('codec (UNIT)', () => {
  it('utf8 round-trips incl. multibyte and astral chars', () => {
    for (const s of ['', 'abc', 'NO₂⁻ µg/L', 'Cr(VI) 💧', 'é\n']) expect(utf8Decode(utf8Encode(s))).toBe(s);
    expect(Array.from(utf8Encode('µ'))).toEqual([0xc2, 0xb5]);
  });
  it('utf8 rejects malformed input', () => {
    expect(() => utf8Decode(Uint8Array.from([0xc2]))).toThrow(/Truncated/);
    expect(() => utf8Decode(Uint8Array.from([0xff]))).toThrow(/lead/);
    expect(() => utf8Decode(Uint8Array.from([0xe0, 0x41, 0x41]))).toThrow(/continuation/);
    expect(() => utf8Decode(Uint8Array.from([0xe0, 0x80, 0x80]))).toThrow(/code point/);
    expect(() => utf8Decode(Uint8Array.from([0xed, 0xa0, 0x80]))).toThrow(/code point/);
  });
  it('base64 matches Node Buffer and rejects garbage', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 64, 255]) {
      const b = Uint8Array.from({ length: len }, (_, i) => (i * 37) & 255);
      const enc = base64Encode(b);
      expect(enc).toBe(Buffer.from(b).toString('base64'));
      expect(Array.from(base64Decode(enc))).toEqual(Array.from(b));
    }
    expect(() => base64Decode('abc')).toThrow();
    expect(() => base64Decode('ab$=')).toThrow();
    expect(() => base64Decode('a=bc')).toThrow();
  });
});

describe('FrameAssembler (UNIT)', () => {
  it('reassembles fragmented frames, incl. a split multibyte char', () => {
    const a = new FrameAssembler();
    const bytes = utf8Encode('{"x":"µ"}\n{"y":1}\n');
    const events = [];
    for (let i = 0; i < bytes.length; i += 3) events.push(...a.push(bytes.slice(i, i + 3)));
    expect(events).toEqual([
      { kind: 'frame', text: '{"x":"µ"}' },
      { kind: 'frame', text: '{"y":1}' },
    ]);
    expect(a.pending).toBe(0);
  });
  it('keeps partial frames pending; ignores blank lines; strips CR', () => {
    const a = new FrameAssembler();
    expect(a.push(utf8Encode('{"a":'))).toEqual([]);
    expect(a.pending).toBe(5);
    expect(a.push(utf8Encode('1}\r\n\n'))).toEqual([{ kind: 'frame', text: '{"a":1}' }]);
  });
  it('discards oversize frames and recovers', () => {
    const a = new FrameAssembler(8);
    expect(a.push(utf8Encode('0123456789ABC\nok\n'))).toEqual([{ kind: 'corrupt', reason: 'frame_too_large' }, { kind: 'frame', text: 'ok' }]);
  });
  it('drops a stale partial frame so it cannot corrupt the next one', () => {
    let t = 0;
    const a = new FrameAssembler(8192, 0x0a, 500, () => t);
    expect(a.push(utf8Encode('{"partial":'))).toEqual([]);
    t = 100;
    expect(a.push(utf8Encode('1}\n'))).toEqual([{ kind: 'frame', text: '{"partial":1}' }]);
    a.push(utf8Encode('{"dangling":'));
    t = 1000;
    expect(a.push(utf8Encode('{"ok":1}\n'))).toEqual([{ kind: 'corrupt', reason: 'stale_partial_frame' }, { kind: 'frame', text: '{"ok":1}' }]);
  });
  it('reports invalid UTF-8 as corrupt', () => {
    const a = new FrameAssembler();
    expect(a.push(Uint8Array.from([0xff, 0x0a]))[0]?.kind).toBe('corrupt');
  });
  it('encodeFrame chunks to MTU − 3', () => {
    const chunks = encodeFrame('x'.repeat(50), 23);
    expect(chunks.map((c) => c.length)).toEqual([20, 20, 11]);
    expect(chunks[2]![10]).toBe(0x0a);
  });
});

describe('parseDeviceFrame (UNIT, provisional protocol)', () => {
  it('parses each message type', () => {
    expect(parseDeviceFrame('{"v":1,"type":"ack","id":3,"ok":true}')).toMatchObject({ ok: true, message: { type: 'ack', id: 3 } });
    expect(parseDeviceFrame('{"v":1,"type":"progress","stage":"dark"}')).toMatchObject({ ok: true });
    const st = parseDeviceFrame('{"v":1,"type":"status","id":1,"device_id":"E1","name":"AquaSense-A1","firmware":"1.0"}');
    expect(st).toMatchObject({ ok: true, message: { busy: false, self_test: {}, calibrations: {} } });
  });
  it('rejects invalid JSON, wrong version, missing fields', () => {
    expect(parseDeviceFrame('{"v":1,"type":"ack"')).toMatchObject({ ok: false, error: 'invalid_json' });
    expect(parseDeviceFrame('{"v":2,"type":"ack","id":1,"ok":true}')).toMatchObject({ ok: false, error: 'unsupported_version' });
    expect(parseDeviceFrame('{"v":1,"type":"status","id":1}')).toMatchObject({ ok: false, error: 'invalid_message' });
    expect(parseDeviceFrame('{"v":1,"type":"teleport"}')).toMatchObject({ ok: false, error: 'invalid_message' });
    expect(parseDeviceFrame('[]')).toMatchObject({ ok: false, error: 'invalid_message' });
  });
});

describe('toNewTestResult (UNIT)', () => {
  const ctx = { deviceId: 'E1', calibrationId: null, phoneTimestamp: '2026-11-19T10:00:00.000Z' };
  const base = { device_test_id: 'T-1', parameter: 'cr6', idark: 10, iblank: 1000, isample: 500, absorbance: 0.3, concentration: 0.4, warnings: [] };

  it('maps a complete result', () => {
    const r = toNewTestResult({ ...base, camera: { status: 'agree', rgb: { r: 1, g: 2, b: 3 } }, timestamp: '2026-11-19T09:59:00Z' }, ctx);
    expect(r).toMatchObject({ ok: true, value: { parameter: 'cr6', concentration: 0.4, measurementQualityStatus: 'ok', cameraValidationStatus: 'agree', cameraRgb: { r: 1, g: 2, b: 3 }, deviceTimestamp: '2026-11-19T09:59:00.000Z' } });
  });
  it('camera disagreement forces retest; photometer value unchanged (no fusion)', () => {
    const r = toNewTestResult({ ...base, camera: { status: 'disagree' } }, ctx);
    expect(r).toMatchObject({ ok: true, value: { retestRequired: true, measurementQualityStatus: 'retest_required', concentration: 0.4 } });
  });
  it('null concentration → invalid status, never fabricated', () => {
    const r = toNewTestResult({ ...base, concentration: null, warnings: ['no_calibration'] }, ctx);
    expect(r).toMatchObject({ ok: true, value: { concentration: null, measurementQualityStatus: 'invalid', deviceWarnings: ['no_calibration'] } });
  });
  it.each([
    [{ ...base, device_test_id: undefined }],
    [{ ...base, parameter: 'arsenic' }],
    [{ ...base, absorbance: 'NaN' }],
    [{ ...base, timestamp: 'yesterday' }],
    [null],
  ])('rejects malformed %o', (raw) => {
    expect(toNewTestResult(raw, ctx).ok).toBe(false);
  });
});
