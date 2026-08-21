#!/usr/bin/env node
import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArtifact } from '../skills/diagrams-for-agents/scripts/validate-artifact.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.mcp.json', 'mcp.json', 'CHANGELOG.md', 'LICENSE', 'README.md',
  'skills/diagrams-for-agents/SKILL.md', 'skills/diagrams-for-agents/agents/openai.yaml',
  'skills/diagrams-for-agents/references/local-primitives.md',
];
for (const path of required) await access(join(root, path));

const codex = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
const claude = JSON.parse(await readFile(join(root, '.claude-plugin/plugin.json'), 'utf8'));
const cursor = JSON.parse(await readFile(join(root, '.cursor-plugin/plugin.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (codex.name !== 'diagrams-for-agents' || claude.name !== 'diagrams-for-agents' || cursor.name !== 'diagrams-for-agents') throw new Error('Plugin names must remain diagrams-for-agents.');
if (codex.version !== claude.version || codex.version !== cursor.version || codex.version !== pkg.version) throw new Error('Plugin versions are out of sync.');

const filesToCheck = ['skills/diagrams-for-agents/SKILL.md', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json'];
for (const path of filesToCheck) {
  const text = await readFile(join(root, path), 'utf8');
  if (/\[TODO:|\bLOREM IPSUM\b|\bPLACEHOLDER\b/i.test(text)) throw new Error(`${path} contains an unfinished placeholder.`);
}

const examples = (await readdir(join(root, 'examples'))).filter((file) => file.endsWith('.html'));
if (examples.length < 6) throw new Error(`Expected at least six generated HTML examples, found ${examples.length}.`);
for (const file of examples) {
  const result = validateArtifact(await readFile(join(root, 'examples', file), 'utf8'));
  if (!result.ok) throw new Error(`${file}: ${result.errors.join(' ')}`);
}
console.log(JSON.stringify({ ok: true, version: codex.version, examples: examples.length }));
