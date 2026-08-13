import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { importMermaid } from '../skills/kolam/scripts/import-mermaid.mjs';
import { renderHtml, renderSvg, validateSpec } from '../skills/kolam/scripts/render.mjs';
import { validateArtifact } from '../skills/kolam/scripts/validate-artifact.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('all six public examples render as self-contained accessible artifacts', async () => {
  const files = (await readdir(join(root, 'examples'))).filter((file) => file.endsWith('.kolam.json'));
  assert.equal(files.length, 6);
  const families = new Set();
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(root, 'examples', file), 'utf8'));
    families.add(spec.family);
    const html = renderHtml(spec);
    const svg = renderSvg(spec);
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title id="kolam-title">/);
    assert.doesNotMatch(svg, /var\(--/);
    assert.deepEqual(validateArtifact(html).errors, []);
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  }
  assert.deepEqual([...families].sort(), ['architecture', 'comparison', 'flow', 'quadrant', 'swot', 'timeline']);
});

test('a SWOT claim without exact source evidence fails closed', () => {
  const spec = {
    family: 'swot', title: 'Unsafe SWOT', source: 'Revenue grew ten percent.', data: {
      strengths: [{ label: 'Revenue doubled', evidence: 'Revenue doubled' }],
      weaknesses: [{ label: 'Unknown costs', evidence: 'Revenue grew ten percent' }],
      opportunities: [{ label: 'Growth', evidence: 'Revenue grew ten percent' }],
      threats: [{ label: 'Costs', evidence: 'Revenue grew ten percent' }],
    },
  };
  assert.throws(() => validateSpec(spec), /is not an exact quote from source/);
});

test('unsafe theme values and remote font injection fail closed', () => {
  const base = {
    family: 'flow', title: 'Flow', data: {
      nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b' }],
    },
  };
  assert.throws(() => validateSpec({ ...base, theme: { accent: 'url(https://bad.example)' } }), /six-digit hex/);
  assert.throws(() => validateSpec({ ...base, theme: { font: 'Inter; background:red' } }), /unsupported characters/);
});

test('dangling graph connections and excessive complexity fail closed', () => {
  const base = { family: 'architecture', title: 'Architecture' };
  assert.throws(() => validateSpec({ ...base, data: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'missing' }] } }), /unknown node/);
  const nodes = Array.from({ length: 10 }, (_, index) => ({ id: `n${index}`, label: `Node ${index}` }));
  assert.throws(() => validateSpec({ ...base, data: { nodes, edges: [] } }), /2–9 items/);
});

test('artifact validation rejects active and remote content', () => {
  const bad = '<html><script src="https://bad.example/x.js"></script><img src="https://bad.example/x.png"><svg></svg></html>';
  const result = validateArtifact(bad);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes('external scripts')));
  assert.ok(result.errors.some((error) => error.includes('external images')));
});

test('bounded Mermaid flows import without carrying renderer styling', () => {
  const spec = importMermaid(`flowchart LR
    A[Collect context] --> B{Enough evidence?}
    B -->|Yes| C[Render]
    B -->|No| D[Ask for detail]`, 'Evidence flow');
  assert.equal(spec.family, 'flow');
  assert.equal(spec.data.nodes.length, 4);
  assert.equal(spec.data.edges.length, 3);
  assert.equal(spec.data.edges[1].label, 'Yes');
  assert.doesNotMatch(JSON.stringify(spec), /classDef|fill:/);
});

test('unsupported Mermaid constructs fail instead of disappearing', () => {
  assert.throws(() => importMermaid(`flowchart TD
    subgraph Private
    A --> B
    end`), /Unsupported Mermaid syntax/);
});
