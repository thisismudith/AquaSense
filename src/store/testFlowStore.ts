import { create } from 'zustand';

import type { ParameterId } from '@/config/parameters';

/** In-progress guided test (A2). Timer state itself is persisted in SQLite for restart recovery. */
interface TestFlowState {
  parameter: ParameterId | null;
  sampleId: string | null;
  reagentId: string | null;
  reagentConsumed: boolean;
  safetyAcknowledged: boolean;
  timerDone: boolean;
  resultId: string | null;
  start: (p: ParameterId) => void;
  patch: (p: Partial<Omit<TestFlowState, 'start' | 'patch' | 'reset'>>) => void;
  reset: () => void;
}

const initial = { parameter: null, sampleId: null, reagentId: null, reagentConsumed: false, safetyAcknowledged: false, timerDone: false, resultId: null };

export const useTestFlow = create<TestFlowState>((set) => ({
  ...initial,
  start: (parameter) => set({ ...initial, parameter }),
  patch: (p) => set(p),
  reset: () => set(initial),
}));
