import { PARAMETERS, type ParameterId } from '@/config/parameters';

/** Reagent preparation steps. Generic sequence only; kit-specific volumes come from the reagent kit instructions. */
export const PREP_STEPS = [
  'Rinse the cuvette with the sample water.',
  'Fill the cuvette with untreated sample — the analyser uses it as the blank (Iblank).',
  'Add the reagent exactly as the kit instructions specify.',
  'Cap and mix gently; avoid bubbles. Wipe the cuvette dry.',
  'Start the reaction timer, then insert the cuvette when prompted.',
];

/** Duration presets within the documented working window; lead has none (pending) and needs manual entry. */
export function durationOptions(p: ParameterId): number[] {
  const rt = PARAMETERS[p].reactionTime;
  if (!rt) return [];
  const opts = new Set([rt.minS, rt.defaultS, Math.round((rt.minS + rt.maxS) / 2), rt.maxS]);
  return [...opts].sort((a, b) => a - b);
}
