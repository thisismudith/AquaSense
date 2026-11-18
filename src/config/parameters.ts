/**
 * Test parameters — WORKING VALUES from AquaSense.md §10 / feature list PDF.
 * They stay configurable until lab calibration confirms them. Lead range and reaction time are
 * intentionally `null` ("pending calibration") — never invent them.
 */
export const PARAMETER_IDS = ['cr6', 'nitrite', 'free_chlorine', 'lead'] as const;
export type ParameterId = (typeof PARAMETER_IDS)[number];

export interface ParameterConfig {
  id: ParameterId;
  /** i18n key for the display name. */
  labelKey: string;
  shortLabel: string;
  reagent: string;
  unit: 'mg/L';
  workingRange: { min: number; max: number } | null;
  /** Reaction time window in seconds; `defaultS` is the timer default. */
  reactionTime: { minS: number; maxS: number; defaultS: number } | null;
  /** Colour family for UI tinting (from PDF parameter colours). */
  tint: 'violet' | 'magenta' | 'pink' | 'amber';
  /** Method caveat to show with results, if any. */
  caveatKey?: string;
}

export const PARAMETERS: Record<ParameterId, ParameterConfig> = {
  cr6: {
    id: 'cr6',
    labelKey: 'parameter.cr6',
    shortLabel: 'Cr(VI)',
    reagent: '1,5-Diphenylcarbazide',
    unit: 'mg/L',
    workingRange: { min: 0.05, max: 1 },
    reactionTime: { minS: 5 * 60, maxS: 10 * 60, defaultS: 5 * 60 },
    tint: 'violet',
  },
  nitrite: {
    id: 'nitrite',
    labelKey: 'parameter.nitrite',
    shortLabel: 'NO₂⁻',
    reagent: 'Sulfanilamide + NED',
    unit: 'mg/L',
    workingRange: { min: 0.01, max: 0.5 },
    reactionTime: { minS: 10 * 60, maxS: 20 * 60, defaultS: 10 * 60 },
    tint: 'magenta',
  },
  free_chlorine: {
    id: 'free_chlorine',
    labelKey: 'parameter.free_chlorine',
    shortLabel: 'Cl₂',
    reagent: 'DPD',
    unit: 'mg/L',
    workingRange: { min: 0.02, max: 2 },
    reactionTime: { minS: 60, maxS: 3 * 60, defaultS: 60 },
    tint: 'pink',
  },
  lead: {
    id: 'lead',
    labelKey: 'parameter.lead',
    shortLabel: 'Pb',
    reagent: 'PAR + buffer',
    unit: 'mg/L',
    workingRange: null,
    reactionTime: null,
    tint: 'amber',
    caveatKey: 'parameter.lead.caveat',
  },
};

export function isParameterId(v: unknown): v is ParameterId {
  return typeof v === 'string' && (PARAMETER_IDS as readonly string[]).includes(v);
}

export const SOURCE_TYPES = ['tap', 'well', 'borewell', 'river', 'lake', 'pond', 'rainwater', 'other'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
