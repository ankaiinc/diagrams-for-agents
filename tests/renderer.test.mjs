import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { importMermaid } from '../skills/diagrams-for-agents/scripts/import-mermaid.mjs';
import { renderHtml, renderSvg, validateSpec } from '../skills/diagrams-for-agents/scripts/render.mjs';
import { validateArtifact } from '../skills/diagrams-for-agents/scripts/validate-artifact.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('all public examples render as self-contained accessible artifacts', async () => {
  const files = (await readdir(join(root, 'examples'))).filter((file) => file.endsWith('.diagrams-for-agents.json'));
  assert.equal(files.length, 6);
  const families = new Set();
  for (const file of files) {
    const spec = JSON.parse(await readFile(join(root, 'examples', file), 'utf8'));
    families.add(spec.family);
    const html = renderHtml(spec);
    const svg = renderSvg(spec);
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title id="diagrams-for-agents-title">/);
    assert.doesNotMatch(svg, /var\(--/);
    assert.deepEqual(validateArtifact(html).errors, []);
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i);
  }
  assert.deepEqual([...families].sort(), ['architecture', 'comparison', 'flow', 'quadrant', 'swot', 'timeline']);
});

test('expanded local primitives have bounded schemas and render without network content', () => {
  const primitives = [
    ['cycle', { levels: [{ label: 'Create' }, { label: 'Share' }, { label: 'Return' }] }],
    ['pyramid', { levels: [{ label: 'Outcome' }, { label: 'Capability' }, { label: 'Foundation' }] }],
    ['stack', { levels: [{ label: 'Experience' }, { label: 'Decision layer' }, { label: 'Data' }] }],
    ['venn', { sets: [{ label: 'Desirable' }, { label: 'Viable' }, { label: 'Feasible' }], overlapLabel: 'Worth building' }],
    ['sipoc', { suppliers: [{ label: 'Sales' }], inputs: [{ label: 'Brief' }], processSteps: [{ label: 'Assess' }], outputs: [{ label: 'Plan' }], customers: [{ label: 'Team' }] }],
    ['raci', { roles: [{ id: 'pm', label: 'PM' }, { id: 'eng', label: 'Engineering' }], activities: [{ id: 'launch', label: 'Launch' }, { id: 'measure', label: 'Measure' }], assignments: [{ activity: 'launch', role: 'pm', value: 'A' }, { activity: 'launch', role: 'eng', value: 'R' }, { activity: 'measure', role: 'pm', value: 'A' }, { activity: 'measure', role: 'eng', value: 'R' }] }],
    ['swimlane', { lanes: [{ label: 'Customer', steps: ['Request', 'Review'] }, { label: 'Team', steps: ['Qualify', 'Respond'] }] }],
    ['fishbone', { effect: 'Slow activation', categories: [{ label: 'Product', causes: [{ label: 'Unclear first step' }] }, { label: 'Distribution', causes: [{ label: 'No sharing prompt' }] }] }],
    ['journey-map', { persona: 'Team lead', stages: [{ label: 'Discover', action: 'Finds plugin', pain: 'Unclear value' }, { label: 'Create', action: 'Makes first artifact', opportunity: 'Share result' }] }],
    ['capability-map', { levels: [{ label: 'Strategic' }, { label: 'Core' }], domains: [{ label: 'Judgment', capabilities: [{ label: 'Choose visual' }, { label: 'Ground claims' }] }, { label: 'Rendering', capabilities: [{ label: 'Generate SVG' }, { label: 'Export artifact' }] }] }],
    ['strategy-map', { financial: [{ label: 'Sustainable revenue' }], customer: [{ label: 'Trusted output' }], internalProcess: [{ label: 'Evidence validation' }], learningGrowth: [{ label: 'Workflow learning' }] }],
  ];
  for (const [family, data] of primitives) {
    const svg = renderSvg({ family, title: `${family} test`, data });
    assert.match(svg, new RegExp(`data-diagrams-for-agents-family="${family}"`));
    assert.doesNotMatch(svg, /(?:src|href)=["']https?:\/\//i);
    assert.doesNotMatch(svg, /var\(--/);
  }
});

test('brand profiles and decision briefs produce a portable editorial artifact', () => {
  const spec = validateSpec({
    family: 'flow',
    title: 'Brand-ready operating loop',
    brief: { decision: 'Which handoff needs attention?', audience: 'Operations', owner: 'Chief of staff', asOf: '2026-08-21' },
    brand: {
      name: 'Northstar',
      guidance: 'Calm operating artifacts with a single focal decision.',
      theme: { paper: '#fbfaf7', surface: '#f0f2ed', ink: '#17201c', muted: '#61706a', accent: '#0d8f79', accent2: '#f0c94b', font: 'Avenir Next, sans-serif', displayFont: 'Avenir Next, sans-serif' },
      style: { tone: 'editorial', density: 'relaxed', corner: 'soft' },
    },
    data: { nodes: [{ id: 'signal', label: 'Read signal', focal: true }, { id: 'decide', label: 'Decide' }], edges: [{ from: 'signal', to: 'decide' }] },
  });
  const svg = renderSvg(spec);
  assert.match(svg, /Northstar/);
  assert.match(svg, /Which handoff needs attention/);
  assert.match(svg, /#f0c94b/i);
  assert.doesNotMatch(svg, /var\(--/);
  assert.throws(() => validateSpec({ ...spec, brand: { name: 'Unsafe', theme: { accent: 'url(https://bad.example)' } } }), /six-digit hex/);
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
