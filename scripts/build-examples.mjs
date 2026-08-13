#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml, renderSvg, validateSpec } from '../skills/kolam/scripts/render.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const examples = join(root, 'examples');
const files = (await readdir(examples)).filter((file) => file.endsWith('.kolam.json')).sort();

for (const file of files) {
  const stem = basename(file, '.kolam.json');
  const spec = validateSpec(JSON.parse(await readFile(join(examples, file), 'utf8')));
  const html = `${stem}.html`;
  const svg = `${stem}.svg`;
  await writeFile(join(examples, html), renderHtml(spec), 'utf8');
  await writeFile(join(examples, svg), renderSvg(spec), 'utf8');
  console.log(`${stem}: ${spec.family} · ${spec.preset}`);
}
