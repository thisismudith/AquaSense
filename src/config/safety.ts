import type { ParameterId } from './parameters';

/**
 * A9 safety & disposal guidance.
 *
 * The feature list asks for short handling/disposal notes with extra care for hexavalent chromium and acidic
 * reagents, but supplies no text. Chemical safety instructions must come from the reagent SDS / the responsible
 * lab and must not be invented (master prompt §9 A9, DECISIONS U3). Until verified text is added here with
 * `verified: true` and a source, the app shows only a pointer to the SDS and the lab's procedure.
 */
export interface SafetyContent {
  verified: boolean;
  source: string | null;
  handling: string[];
  disposal: string[];
}

const PENDING: SafetyContent = { verified: false, source: null, handling: [], disposal: [] };

export const SAFETY: Record<ParameterId, SafetyContent> = {
  cr6: PENDING,
  nitrite: PENDING,
  free_chlorine: PENDING,
  lead: PENDING,
};

/** Parameters whose reagents the feature list flags for extra care. Used only to highlight, not to instruct. */
export const EXTRA_CARE: Partial<Record<ParameterId, string>> = {
  cr6: 'The feature list flags hexavalent chromium and acidic reagents for extra care.',
};
