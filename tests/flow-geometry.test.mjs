import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { flowProblems } from './support/flow-problems.mjs';
import { graphGeometry, renderSvg } from '../skills/diagrams-for-agents/scripts/render.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const topologies = JSON.parse(await readFile(join(root, 'tests', 'fixtures', 'flow-topologies.json'), 'utf8'));

test('every reference topology renders with no crossings, overlaps, truncation or clipped text', () => {
  for (const { name, spec } of topologies) {
    assert.deepEqual(flowProblems(spec), [], name);
  }
});

test('the real-report corpus (neutral copies with real lengths) is valid and clean in every preset', () => {
  // Permanent compat guard: a limit that rejects any of these is a regression, whatever the stress numbers say.
  for (const { name, spec } of topologies) {
    for (const preset of ['doc-wide', 'slide-16x9', 'social-square', 'fit']) {
      const problems = flowProblems({ ...spec, preset });
      assert.deepEqual(problems, [], `${name} ${preset}`);
      assert.doesNotMatch(renderSvg({ ...spec, preset }), /…/, `${name} ${preset}`);
    }
  }
  assert.ok(topologies.length >= 8);
  assert.ok(topologies.every(({ spec }) => spec.title.length >= 44 && spec.subtitle.length >= 90), 'fixtures keep realistic title and subtitle lengths');
});

test('a backward edge is drawn as a loop that points into its target', () => {
  const spec = {
    version: '1.0', family: 'flow', preset: 'doc-wide', title: 'Retry loop', source: 'fixture',
    data: {
      nodes: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((label, i) => ({ id: `N${i + 1}`, label })),
      edges: [{ from: 'N1', to: 'N2' }, { from: 'N2', to: 'N3' }, { from: 'N3', to: 'N4', label: 'ok' }, { from: 'N4', to: 'N5' }, { from: 'N5', to: 'N6' }, { from: 'N6', to: 'N2', label: 'supported retry' }],
    },
  };
  assert.deepEqual(flowProblems(spec), []);
  const g = graphGeometry(spec);
  const back = g.routes.find((r) => r.edge.from === 'N6');
  const target = g.positions.get('N2');
  const [[, py], [, ly]] = [back.pts[back.pts.length - 2], back.pts[back.pts.length - 1]];
  assert.equal(ly, target.y + target.h, 'enters the target from below');
  assert.ok(py > ly, 'moves up into the target');
});

test('two edges with long labels get their own tracks and both labels are readable', () => {
  const spec = {
    version: '1.0', family: 'flow', preset: 'doc-wide', title: 'Labels', source: 'fixture',
    data: {
      nodes: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((label, i) => ({ id: `N${i + 1}`, label: `${label} step`, detail: 'A detail that needs two lines of text in the card' })),
      edges: [{ from: 'N1', to: 'N2', label: 'accepted by receiver' }, { from: 'N4', to: 'N5', label: 'accepted' }, { from: 'N4', to: 'N7', label: 'supported retry path' }, { from: 'N7', to: 'N2', label: 'supported retry' }, { from: 'N3', to: 'N6', label: 'rejected' }],
    },
  };
  assert.deepEqual(flowProblems(spec), []);
  const svg = renderSvg(spec);
  assert.doesNotMatch(svg, /…/);
});

test('a card behind a connector is opaque so nothing shows through it', () => {
  const svg = renderSvg(topologies[0].spec);
  const underlay = (svg.match(/<rect [^>]*rx="8" fill="#ffffff"\/>/g) || []).length;
  assert.ok(underlay >= topologies[0].spec.data.nodes.length);
});
