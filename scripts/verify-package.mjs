#!/usr/bin/env node
import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArtifact } from '../skills/diagrams-for-agents/scripts/validate-artifact.mjs';
import { listSkillArchiveEntries } from './skill-archive.mjs';

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

const skillText = await readFile(join(root, 'skills/diagrams-for-agents/SKILL.md'), 'utf8');
const skillDescription = skillText.match(/^description:\s*(.+)$/m)?.[1]?.trim();
if (!skillDescription || skillDescription.length > 200) throw new Error(`Skill description must fit Claude's 200-character limit; found ${skillDescription?.length ?? 0}.`);

const canonicalBase = 'https://diagrams.4agents.fyi';
for (const path of ['.mcp.json', 'mcp.json']) {
  const text = await readFile(join(root, path), 'utf8');
  if (!text.includes(canonicalBase)) throw new Error(`${path} must use ${canonicalBase}.`);
  if (text.includes('diagramsforagents.pragmaticleaders.io')) throw new Error(`${path} contains the retired public hostname.`);
}

const archive = await readFile(join(root, 'dist', `diagrams-for-agents-skill-${pkg.version}.zip`));
const archiveEntries = listSkillArchiveEntries(archive);
if (!archiveEntries.includes('diagrams-for-agents/SKILL.md')) throw new Error('Claude ZIP is missing diagrams-for-agents/SKILL.md.');
if (archiveEntries.some((entry) => !entry.startsWith('diagrams-for-agents/') || entry.includes('../'))) throw new Error('Claude ZIP must contain exactly one safe skill folder root.');

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
