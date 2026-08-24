#!/usr/bin/env node
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSkillArchive } from './skill-archive.mjs';

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = resolve(process.cwd(), process.argv[2] || 'dist');
const skillDirectory = join(pluginRoot, 'skills', 'diagrams-for-agents');
const pkg = JSON.parse(await readFile(join(pluginRoot, 'package.json'), 'utf8'));
const versionedName = `diagrams-for-agents-skill-${pkg.version}.zip`;
const stableName = 'diagrams-for-agents-skill.zip';

await mkdir(outputDirectory, { recursive: true });
const versionedPath = join(outputDirectory, versionedName);
const result = await createSkillArchive({ skillDirectory, outputPath: versionedPath });
await copyFile(versionedPath, join(outputDirectory, stableName));
await writeFile(join(outputDirectory, `${versionedName}.sha256`), `${result.sha256}  ${versionedName}\n`);
await writeFile(join(outputDirectory, `${stableName}.sha256`), `${result.sha256}  ${stableName}\n`);

console.log(JSON.stringify({ ok: true, version: pkg.version, outputDirectory, ...result }));
