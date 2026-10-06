import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { limitFor } from './support/limits.mjs';
import { renderSvg, validateSpec } from '../skills/diagrams-for-agents/scripts/render.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('the documented fishbone example matches the renderer schema', async () => {
  const reference = await readFile(join(root, 'skills/diagrams-for-agents/references/local-primitives.md'), 'utf8');
  const example = reference.match(/\{ "family": "fishbone"[^\n]+\}/)?.[0];
  assert.ok(example, 'fishbone JSON example is present');
  const spec = validateSpec({ title: 'Documented fishbone', ...JSON.parse(example) });
  assert.match(renderSvg(spec), /data-diagrams-for-agents-family="fishbone"/);
});

test('a valid maximum-length title wraps into a bounded dynamic header', () => {
  const title = 'A deliberately long but valid decision title that must remain readable without colliding with metadata or content'.padEnd(limitFor('architecture', 'social-square', 2, 'title'), '!').slice(0, limitFor('architecture', 'social-square', 2, 'title'));
  assert.equal(title.length, limitFor('architecture', 'social-square', 2, 'title'));
  const svg = renderSvg({
    family: 'architecture',
    preset: 'social-square',
    title,
    brief: { decision: 'Choose the safe launch path', audience: 'Executive team' },
    data: {
      nodes: [{ id: 'input', label: 'Input' }, { id: 'output', label: 'Output' }],
      edges: [{ from: 'input', to: 'output' }],
    },
  });
  const titleBlock = svg.match(/<text[^>]+class="diagram-title"[^>]*>([\s\S]*?)<\/text>/)?.[1] ?? '';
  assert.ok((titleBlock.match(/<tspan/g) ?? []).length >= 2, 'long title wraps across lines');
  const firstBodyY = Number(svg.match(/<rect x="64" y="([0-9.]+)"[^>]+class="node-card"/)?.[1] ?? 0);
  const titleYs = [...titleBlock.matchAll(/dy="([0-9.]+)"/g)].map((match) => Number(match[1]));
  assert.ok(firstBodyY === 0 || firstBodyY > 160, 'diagram content begins below the expanded header');
  assert.ok(titleYs.length >= 2);
});

test('capability labels and journey persona occupy reserved layout space', () => {
  const capability = renderSvg({
    family: 'capability-map', title: 'Capability map',
    data: {
      levels: [{ label: 'Strategic leadership' }, { label: 'Core delivery' }],
      domains: [
        { label: 'Judgment', capabilities: [{ label: 'Choose visual' }, { label: 'Ground claims' }] },
        { label: 'Rendering', capabilities: [{ label: 'Generate SVG' }, { label: 'Export artifact' }] },
      ],
    },
  });
  assert.match(capability, /<rect x="1(?:6[0-9]|7[0-9]|8[0-9]|9[0-9]|[7-9][0-9]{2})/);

  const journey = renderSvg({
    family: 'journey-map', title: 'Journey map', subtitle: 'A subtitle that should never collide with the persona',
    data: { persona: 'Team lead', stages: [{ label: 'Discover', action: 'Finds plugin' }, { label: 'Create', action: 'Makes artifact' }] },
  });
  const personaY = Number(journey.match(/y="([0-9.]+)" class="eyebrow">PERSONA/)?.[1]);
  const columnYs = [...journey.matchAll(/<rect x="64" y="([0-9.]+)" width=/g)].map((match) => Number(match[1]));
  assert.ok(columnYs.some((y) => y > personaY), 'persona is placed above the journey columns');
});
