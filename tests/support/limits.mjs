import { limitRows } from '../../skills/diagrams-for-agents/scripts/fit.mjs';

/** The declared text limit for a kind in a family, preset, primary item count and header tier (clamped like validateSpec does). */
export function limitFor(family, preset, count, kind, tier = 0) {
  const rows = limitRows(family, preset);
  const ks = Object.keys(rows).map(Number).sort((a, b) => a - b);
  return rows[Math.max(ks[0], Math.min(ks.at(-1), count))][tier][kind];
}
