import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { listSkillArchiveEntries } from '../scripts/skill-archive.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const versionedName = `diagrams-for-agents-skill-${pkg.version}.zip`;

test('the Claude upload is a small, self-contained skill folder ZIP', async () => {
  const versioned = await readFile(join(root, 'dist', versionedName));
  const stable = await readFile(join(root, 'dist', 'diagrams-for-agents-skill.zip'));
  assert.deepEqual(stable, versioned);
  assert.ok(versioned.length < 5_000_000, `Expected upload below 5 MB, found ${versioned.length} bytes.`);

  const entries = listSkillArchiveEntries(versioned);
  assert.ok(entries.length >= 10);
  assert.ok(entries.every((entry) => entry.startsWith('diagrams-for-agents/')));
  assert.ok(entries.every((entry) => !entry.includes('../')));
  assert.ok(entries.includes('diagrams-for-agents/SKILL.md'));
  assert.ok(entries.includes('diagrams-for-agents/scripts/render.mjs'));
  assert.ok(entries.includes('diagrams-for-agents/scripts/validate-artifact.mjs'));
  // render.mjs imports these at load time; a package without them cannot render at all.
  assert.ok(entries.includes('diagrams-for-agents/scripts/fit.mjs'));
  assert.ok(entries.includes('diagrams-for-agents/scripts/fit-limits.mjs'));
  assert.ok(entries.includes('diagrams-for-agents/references/visual-selection.md'));

  const digest = createHash('sha256').update(versioned).digest('hex');
  const checksum = await readFile(join(root, 'dist', `${versionedName}.sha256`), 'utf8');
  assert.equal(checksum, `${digest}  ${versionedName}\n`);
});

test('the shared skill metadata fits Claude upload and Agent Skills contracts', async () => {
  const skill = await readFile(join(root, 'skills', 'diagrams-for-agents', 'SKILL.md'), 'utf8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatter, 'SKILL.md must begin with YAML frontmatter.');
  const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
  assert.equal(name, 'diagrams-for-agents');
  assert.ok(description);
  assert.ok(description.length <= 200, `Claude descriptions must be 200 characters or fewer, found ${description.length}.`);
});
