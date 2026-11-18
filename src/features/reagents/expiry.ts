import { daysUntilExpiry, isExpired } from '@/database/repositories/ReagentRepository';
import { EXPIRY_WARNING_DAYS } from '@/features/dashboard/alerts';
import type { Reagent } from '@/types/domain';

/** Groups reagents by expiry status (screen 34). */
export function groupByExpiry(list: readonly Reagent[], now = new Date()) {
  const expired: Reagent[] = [];
  const soon: Reagent[] = [];
  const ok: Reagent[] = [];
  for (const r of [...list].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))) {
    if (isExpired(r, now)) expired.push(r);
    else if (daysUntilExpiry(r, now) <= EXPIRY_WARNING_DAYS) soon.push(r);
    else ok.push(r);
  }
  return { expired, soon, ok };
}
