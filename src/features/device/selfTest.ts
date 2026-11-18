/** Feature list D11 self-test items. Unknown keys from firmware are still shown verbatim. */
export const SELF_TEST_LABELS: Record<string, string> = {
  green_led: 'Green LED (525 nm)',
  backlight_led: 'White backlight LED',
  photodiode: 'Photodetector',
  camera_link: 'Camera link (ESP32-B)',
  supply_voltage: 'USB-C supply voltage',
};

export function selfTestSummary(selfTest: Record<string, string>): { pass: number; fail: number; unknown: number } {
  const v = Object.values(selfTest);
  return {
    pass: v.filter((x) => x === 'pass').length,
    fail: v.filter((x) => x === 'fail').length,
    unknown: v.filter((x) => x !== 'pass' && x !== 'fail').length,
  };
}
