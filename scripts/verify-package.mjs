#!/usr/bin/env node
import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArtifact } from '../skills/kolam/scripts/validate-artifact.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.mcp.json', 'mcp.json', 'LICENSE', 'README.md',
  'skills/kolam/SKILL.md', 'skills/kolam/agents/openai.yaml',
];
for (const path of required) await access(join(root, path));

const codex = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
const claude = JSON.parse(await readFile(join(root, '.claude-plugin/plugin.json'), 'utf8'));
const cursor = JSON.parse(await readFile(join(root, '.cursor-plugin/plugin.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (codex.name !== 'kolam' || claude.name !== 'kolam' || cursor.name !== 'kolam') throw new Error('Plugin names must remain kolam.');
if (codex.version !== claude.version || codex.version !== cursor.version || codex.version !== pkg.version) throw new Error('Plugin versions are out of sync.');

const filesToCheck = ['skills/kolam/SKILL.md', '.codex-plugin/plugin.json', '.claude-plugin/plugin.json', '.cursor-plugin/plugin.json'];
for (const path of filesToCheck) {
  const text = await readFile(join(root, path), 'utf8');
  if (/\[TODO:|\bLOREM IPSUM\b|\bPLACEHOLDER\b/i.test(text)) throw new Error(`${path} contains an unfinished placeholder.`);
}

const examples = (await readdir(join(root, 'examples'))).filter((file) => file.endsWith('.html'));
if (examples.length !== 6) throw new Error(`Expected six generated HTML examples, found ${examples.length}.`);
for (const file of examples) {
  const result = validateArtifact(await readFile(join(root, 'examples', file), 'utf8'));
  if (!result.ok) throw new Error(`${file}: ${result.errors.join(' ')}`);
}
console.log(JSON.stringify({ ok: true, version: codex.version, examples: examples.length }));
