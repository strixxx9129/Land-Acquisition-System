import type { LocalizedText } from '@lams/shared';
import { Jurisdiction } from './jurisdiction.model.js';
import { Organization } from './organization.model.js';

const TTL_MS = 5 * 60_000;
let cache: { at: number; names: Map<string, LocalizedText> } | null = null;

/** Display names for jurisdiction and organisation codes (master data changes rarely; cached 5 min). */
export async function masterLabels(): Promise<Map<string, LocalizedText>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.names;
  const [units, orgs] = await Promise.all([Jurisdiction.find().select('code name').lean(), Organization.find().select('code name').lean()]);
  const names = new Map<string, LocalizedText>();
  for (const u of units) names.set(`J:${u.code}`, u.name as LocalizedText);
  for (const o of orgs) names.set(`O:${o.code}`, o.name as LocalizedText);
  cache = { at: Date.now(), names };
  return names;
}

export function invalidateMasterLabels(): void {
  cache = null;
}
