import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { cells, limitRows, primaryCount, PRIMARY } from '../skills/diagrams-for-agents/scripts/fit.mjs';
import { FIT_LIMITS } from '../skills/diagrams-for-agents/scripts/fit-limits.mjs';
import { limitFor } from './support/limits.mjs';
import { SUPPORTED_FAMILIES, renderSvg, validateSpec } from '../skills/diagrams-for-agents/scripts/render.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const claim = (label) => ({ label, evidence: 'Source quote' });
const items = (n, make) => Array.from({ length: n }, (_, i) => make(i));
// Text of exactly n characters made of short words (the unbroken-word cap is tested separately).
const word = (n) => 'ab cd '.repeat(Math.ceil(n / 6) + 1).slice(0, n).replace(/ $/, 'x');

// A small valid spec per family, plus [kind, path] pairs naming where each length kind lives in it.
const MINIMAL = {
  flow: { data: { nodes: [{ id: 'a', label: 'A', detail: 'd' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', label: 'ok' }] }, fields: [['node.label', 'data.nodes[1].label'], ['node.detail', 'data.nodes[0].detail'], ['edge.label', 'data.edges[0].label']], counts: [['nodes', 'data.nodes']] },
  architecture: { data: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', label: 'ok' }] }, fields: [['node.label', 'data.nodes[0].label'], ['edge.label', 'data.edges[0].label']], counts: [['nodes', 'data.nodes'], ['edges', 'data.edges']] },
  swot: { source: 'Source quote', data: Object.fromEntries(['strengths', 'weaknesses', 'opportunities', 'threats'].map((k) => [k, [claim('Item')]])), fields: [['item.label', 'data.threats[0].label']], counts: [['items', 'data.strengths']] },
  quadrant: { source: 'Source quote', data: { axes: { xLow: 'L', xHigh: 'H', yLow: 'L', yHigh: 'H' }, points: [{ ...claim('P1'), x: 0.2, y: 0.2 }, { ...claim('P2'), x: 0.8, y: 0.8 }] }, fields: [['axis.label', 'data.axes.yHigh'], ['point.label', 'data.points[1].label']], counts: [['points', 'data.points']] },
  comparison: { source: 'Source quote', data: { columns: [{ title: 'A', items: [claim('i')] }, { title: 'B', items: [claim('i')] }] }, fields: [['column.title', 'data.columns[1].title'], ['item.label', 'data.columns[0].items[0].label']], counts: [['columns', 'data.columns'], ['items', 'data.columns[0].items']] },
  timeline: { data: { items: [{ date: '2026', label: 'One', detail: 'd' }, { date: '2027', label: 'Two' }] }, fields: [['item.date', 'data.items[1].date'], ['item.label', 'data.items[0].label'], ['item.detail', 'data.items[0].detail']], counts: [['items', 'data.items']] },
  cycle: { data: { levels: [{ label: 'A', description: 'd' }, { label: 'B' }] }, fields: [['level.label', 'data.levels[1].label'], ['level.description', 'data.levels[0].description']], counts: [['levels', 'data.levels']] },
  pyramid: { data: { levels: [{ label: 'A' }, { label: 'B' }] }, fields: [['level.label', 'data.levels[1].label']], counts: [['levels', 'data.levels']] },
  stack: { data: { levels: [{ label: 'A' }, { label: 'B' }] }, fields: [['level.label', 'data.levels[0].label']], counts: [['levels', 'data.levels']] },
  venn: { data: { sets: [{ label: 'A' }, { label: 'B' }], overlapLabel: 'Both' }, fields: [['set.label', 'data.sets[0].label'], ['overlap.label', 'data.overlapLabel']], counts: [['sets', 'data.sets']] },
  sipoc: { data: Object.fromEntries(['suppliers', 'inputs', 'processSteps', 'outputs', 'customers'].map((k) => [k, [{ label: 'x' }]])), fields: [['item.label', 'data.outputs[0].label']], counts: [['items', 'data.inputs']] },
  raci: { data: { roles: [{ id: 'r1', label: 'R1' }, { id: 'r2', label: 'R2' }], activities: [{ id: 'a1', label: 'A1' }, { id: 'a2', label: 'A2' }], assignments: ['a1', 'a2'].flatMap((a) => [{ activity: a, role: 'r1', value: 'R' }, { activity: a, role: 'r2', value: 'A' }]) }, fields: [['role.label', 'data.roles[1].label'], ['activity.label', 'data.activities[0].label']], counts: [['roles', 'data.roles'], ['activities', 'data.activities']] },
  swimlane: { data: { lanes: [{ label: 'A', steps: ['one'] }, { label: 'B', steps: ['two'] }] }, fields: [['lane.label', 'data.lanes[1].label'], ['step.label', 'data.lanes[0].steps[0]']], counts: [['lanes', 'data.lanes'], ['steps', 'data.lanes[0].steps']] },
  fishbone: { data: { effect: 'Effect', categories: [{ label: 'A', causes: [{ label: 'c' }] }, { label: 'B', causes: [{ label: 'c' }] }] }, fields: [['effect', 'data.effect'], ['category.label', 'data.categories[0].label'], ['cause.label', 'data.categories[1].causes[0].label']], counts: [['categories', 'data.categories'], ['causes', 'data.categories[0].causes']] },
  'journey-map': { data: { persona: 'P', stages: [{ label: 'A', action: 'a', pain: 'p', opportunity: 'o' }, { label: 'B', action: 'b' }] }, fields: [['persona', 'data.persona'], ['stage.label', 'data.stages[1].label'], ['stage.action', 'data.stages[1].action'], ['stage.pain', 'data.stages[0].pain'], ['stage.opportunity', 'data.stages[0].opportunity']], counts: [['stages', 'data.stages']] },
  'capability-map': { data: { levels: [{ label: 'L1' }, { label: 'L2' }], domains: [{ label: 'D1', capabilities: [{ label: 'c' }] }, { label: 'D2', capabilities: [{ label: 'c' }] }] }, fields: [['level.label', 'data.levels[0].label'], ['domain.label', 'data.domains[1].label'], ['capability.label', 'data.domains[0].capabilities[0].label']], counts: [['levels', 'data.levels'], ['domains', 'data.domains'], ['capabilities', 'data.domains[0].capabilities']] },
  'strategy-map': { data: Object.fromEntries(['financial', 'customer', 'internalProcess', 'learningGrowth'].map((k) => [k, [{ label: 'x' }]])), fields: [['item.label', 'data.customer[0].label']], counts: [['items', 'data.financial']] },
};
const HEADER = [['title', 'title'], ['subtitle', 'subtitle'], ['brand.name', 'brand.name'], ['brief.decision', 'brief.decision'], ['brief.audience', 'brief.audience'], ['brief.owner', 'brief.owner'], ['brief.asOf', 'brief.asOf']];

function spec(family) {
  const { fields, counts, ...rest } = structuredClone(MINIMAL[family]);
  void fields; void counts;
  return { family, title: 'T', ...rest };
}
function setPath(target, path, value) {
  const keys = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) node = (node[key] ??= {});
  node[keys.at(-1)] = value;
}
function getPath(target, path) {
  return path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((node, key) => node[key], target);
}

test('every family has fit limits, and every limit is enforced with the exact path, length and allowed length', () => {
  assert.deepEqual(Object.keys(FIT_LIMITS).sort(), [...SUPPORTED_FAMILIES].sort());
  for (const family of SUPPORTED_FAMILIES) {
    const { counts: countLimits } = FIT_LIMITS[family];
    for (const preset of ['doc-wide', 'social-square']) {
      for (const [kind, path] of [...MINIMAL[family].fields, ...HEADER]) {
        const base = { ...spec(family), preset };
        const limit = limitFor(family, preset, primaryCount(family, base.data), kind);
        assert.ok(Number.isInteger(limit) && limit > 0, `${family} has a limit for ${kind}`);
        const ok = structuredClone(base);
        setPath(ok, path, word(limit));
        assert.doesNotThrow(() => validateSpec(ok), `${family} ${preset} ${path} at its limit`);
        const over = structuredClone(base);
        setPath(over, path, word(limit + 1));
        assert.throws(() => validateSpec(over), new RegExp(`^Error: Diagrams for Agents spec: ${path.replace(/[[\].]/g, '\\$&')} is ${limit + 1} characters; with \\d+ ${PRIMARY[family]} on ${preset}[^,]*, ${family} diagrams fit at most ${limit}[^.]*\\. Shorten it or split the diagram\\.$`), `${family} ${preset} ${path}`);
      }
    }
    for (const [kind, path] of MINIMAL[family].counts) {
      const limit = countLimits[kind];
      assert.ok(Number.isInteger(limit) && limit > 0, `${family} has a count limit for ${kind}`);
      const over = spec(family);
      const list = getPath(over, path);
      while (list.length < limit + 1) list.push(structuredClone(typeof list[0] === 'object' ? { ...list[0], id: `extra${list.length}` } : list[0]));
      assert.throws(() => validateSpec(over), new RegExp(`${path.replace(/[[\].]/g, '\\$&')} has ${limit + 1} items; ${family} diagrams fit at most ${limit}\\. Split it across two diagrams\\.`), `${family} ${path}`);
    }
  }
});

test('limits depend on how crowded the diagram is: the message names both the small and the crowded limit', () => {
  const small = (n) => ({ family: 'flow', title: 'T', preset: 'doc-wide', data: { nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: i === 2 ? word(200) : 'Step' })), edges: [{ from: 'n0', to: 'n1' }] } });
  const at3 = limitFor('flow', 'doc-wide', 3, 'node.label');
  const maxNodes = Math.max(...Object.keys(limitRows('flow', 'doc-wide')).map(Number));
  const at8 = limitFor('flow', 'doc-wide', maxNodes, 'node.label');
  assert.ok(at3 > at8, `3 nodes (${at3}) get more room than ${maxNodes} (${at8})`);
  assert.throws(() => validateSpec(small(3)), new RegExp(`data\\.nodes\\[2\\]\\.label is 200 characters; with 3 nodes on doc-wide, flow diagrams fit at most ${at3}; with ${maxNodes} nodes, ${at8}`));
});

test('a small flow on doc-wide keeps the generous limit its cards honestly fit', () => {
  const flow = (n, length) => ({
    family: 'flow', title: 'Order handling for the retail desk', preset: 'doc-wide',
    data: {
      nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `Step ${i + 1} ${'review and confirm the order '.repeat(5)}`.slice(0, length).trim() })),
      edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
    },
  });
  for (const [n, length] of [[3, 45], [4, 40], [5, 36], [6, 33], [8, 29]]) {
    assert.ok(limitFor('flow', 'doc-wide', n, 'node.label') >= length, `${n} nodes x ${length}`);
    assert.doesNotMatch(renderSvg(flow(n, length)), /…/, `${n} nodes x ${length}`);
  }
});

test('small diagrams are never held to the crowded limit (swot, comparison, timeline, swimlane, journey-map)', () => {
  for (const [family, kind, small, big] of [['swot', 'item.label', 1, 4], ['comparison', 'item.label', 2, 4], ['timeline', 'item.label', 2, 8], ['swimlane', 'step.label', 2, 4], ['journey-map', 'stage.label', 2, 6]]) {
    for (const preset of ['doc-wide', 'slide-16x9', 'social-square', 'fit']) {
      assert.ok(limitFor(family, preset, small, kind) >= limitFor(family, preset, big, kind), `${family} ${preset}`);
    }
  }
});

test('wide characters count double so CJK text cannot overflow a limit sized for Latin text', () => {
  assert.equal(cells('abc'), 3);
  assert.equal(cells('システム'), 8);
  const limit = limitFor('pyramid', 'doc-wide', 2, 'level.label');
  const fits = '字'.repeat(Math.floor(limit / 2));
  const over = '字'.repeat(Math.floor(limit / 2) + 1);
  const make = (label) => ({ family: 'pyramid', title: 'T', data: { levels: [{ label }, { label: 'B' }] } });
  assert.doesNotThrow(() => validateSpec(make(fits)));
  if (limit % 2 === 0) assert.throws(() => validateSpec(make(over)), /characters; with 2 levels on doc-wide, pyramid diagrams fit at most/);
});

test('text that used to be silently cut now fails loudly instead', () => {
  // 0.3.3 sliced node detail at 140 characters, edge labels at 60 and subtitles at 220 without telling anyone.
  const data = { nodes: [{ id: 'a', label: 'A', detail: word(141) }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] };
  assert.throws(() => validateSpec({ family: 'flow', title: 'T', data }), /data\.nodes\[0\]\.detail is 141 characters/);
  assert.throws(() => validateSpec({ family: 'swot', title: 'T', subtitle: word(221), source: 'q', data: MINIMAL.swot.data }), /subtitle is 221 characters/);
});

test('optional text may be absent or empty, required text may not', () => {
  const base = spec('flow');
  base.data.nodes[0].detail = '';
  base.data.edges[0].label = undefined;
  assert.doesNotThrow(() => validateSpec(base));
  base.data.nodes[0].label = '   ';
  assert.throws(() => validateSpec(base), /data\.nodes\[0\]\.label must be a non-empty string\./);
});

test('every shipped example still fits the limits', async () => {
  const dir = join(root, 'examples');
  for (const file of (await readdir(dir)).filter((name) => name.endsWith('.diagrams-for-agents.json'))) {
    const value = JSON.parse(await readFile(join(dir, file), 'utf8'));
    for (const preset of ['doc-wide', 'slide-16x9', 'social-square', 'fit']) {
      assert.doesNotThrow(() => renderSvg({ ...value, preset }), `${file} in ${preset}`);
    }
  }
});

test('an unbroken word longer than the cap is rejected with the word named; shorter long words wrap inside their card', () => {
  const rows = limitRows('flow', 'doc-wide');
  const cap = rows[2][0].token;
  const make = (label) => ({ family: 'flow', title: 'T', data: { nodes: [{ id: 'a', label }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }] } });
  assert.throws(() => validateSpec(make('x'.repeat(cap + 1))), new RegExp(`data\\.nodes\\[0\\]\\.label contains a ${cap + 1}-character word .*of at most ${cap} characters here\\. Add spaces or shorten it\\.`));
  const svg = renderSvg(make('x'.repeat(cap)));
  assert.doesNotMatch(svg, /…/);
  assert.ok(svg.replace(/<[^>]+>/g, '').replace(/\s+/g, '').includes('x'.repeat(cap)), 'the whole word is drawn');
  // CJK may break anywhere, so a long run without spaces is fine as long as it fits the cell budget.
  assert.doesNotThrow(() => renderSvg(make('字'.repeat(Math.floor(limitFor('flow', 'doc-wide', 2, 'node.label') / 2)))));
});

// ---- regressions: the typical-content defects the quality gate found in 0.3.3 ---------------------------------------
const rectsOf = (svg) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="8"/g)].map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));

test('cycle cards never overlap and stay inside the canvas on every preset', () => {
  const levels = (n) => items(n, (i) => ({ label: `Stage ${i + 1} of the loop`, description: 'What happens in this stage, briefly' }));
  for (const [preset, width, height] of [['doc-wide', 1200, 700], ['slide-16x9', 1600, 900], ['social-square', 1080, 1080], ['fit', 1200, 800]]) {
    for (const n of [3, 5, 8]) {
      const cards = rectsOf(renderSvg({ family: 'cycle', preset, title: 'Loop', data: { levels: levels(n) } })).filter((r) => r.w < width / 2);
      assert.equal(cards.length, n, `${preset} ${n}`);
      for (const c of cards) assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= width && c.y + c.h <= height, `${preset} ${n} inside canvas`);
      for (let i = 0; i < cards.length; i += 1) for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i]; const b = cards[j];
        assert.ok(a.x + a.w <= b.x + 0.5 || b.x + b.w <= a.x + 0.5 || a.y + a.h <= b.y + 0.5 || b.y + b.h <= a.y + 0.5, `${preset} ${n}: cards ${i} and ${j} overlap`);
      }
    }
  }
});

test('quadrant labels stay on the canvas on a social square, even beside the right edge', () => {
  const points = items(6, (i) => ({ ...claim(`Point ${i + 1} with a typical label`), x: [0.1, 0.4, 0.7, 0.92, 0.3, 0.6][i], y: [0.8, 0.7, 0.8, 0.3, 0.3, 0.2][i] }));
  const svg = renderSvg({ family: 'quadrant', preset: 'social-square', title: 'Quadrant', source: 'Source quote', data: { axes: { xLow: 'Low effort', xHigh: 'High effort', yLow: 'Low value', yHigh: 'High value' }, points } });
  assert.doesNotMatch(svg, /…/);
  for (const match of svg.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="(start|end)"/g)) {
    const x = Number(match[1]);
    assert.ok(x > 0 && x < 1080, `label anchor ${x} is on the canvas`);
  }
});

test('timeline details are printed in full', () => {
  const detail = 'Customers move from the pilot group to every region and every plan';
  const svg = renderSvg({ family: 'timeline', preset: 'doc-wide', title: 'Roadmap', data: { items: items(5, (i) => ({ date: `Q${i + 1} 2026`, label: `Milestone ${i + 1} reached`, detail })) } });
  assert.doesNotMatch(svg, /…/);
  const text = svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.equal(text.split(detail.split(' ')[0]).length - 1 >= 5, true);
  for (const w of detail.split(' ')) assert.ok(text.includes(w), w);
});

test('typical journey and venn content renders without truncation on every preset', () => {
  for (const preset of ['doc-wide', 'slide-16x9', 'social-square', 'fit']) {
    const journey = renderSvg({ family: 'journey-map', preset, title: 'Journey', data: { persona: 'Team lead', stages: items(4, (i) => ({ label: `Stage ${i + 1}`, action: 'Finds the plugin and reads the guide', pain: 'Too many options to choose from', opportunity: 'Recommend one default path' })) } });
    const venn = renderSvg({ family: 'venn', preset, title: 'Venn', data: { sets: [{ label: 'Desirable' }, { label: 'Feasible' }, { label: 'Viable' }], overlapLabel: 'Sweet spot' } });
    assert.doesNotMatch(journey + venn, /…/);
  }
});
