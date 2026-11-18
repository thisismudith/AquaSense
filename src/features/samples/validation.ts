export function validateSampleForm(v: { name: string; notes: string }): { name?: string; notes?: string } {
  const e: { name?: string; notes?: string } = {};
  if (!v.name.trim()) e.name = 'Enter a sample name';
  else if (v.name.trim().length > 120) e.name = 'Name must be 120 characters or fewer';
  if (v.notes.length > 2000) e.notes = 'Notes must be 2000 characters or fewer';
  return e;
}
