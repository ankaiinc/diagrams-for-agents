#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { validateSpec } from './render.mjs';

export function validateArtifact(html) {
  const errors = [];
  const required = [
    ['an inline SVG', /<svg\b/i],
    ['an accessible SVG role', /<svg\b[^>]*\brole=["']img["']/i],
    ['an accessible title reference', /aria-labelledby=["'][^"']+["']/i],
    ['an SVG title', /<title\b[^>]*>/i],
    ['an SVG description', /<desc\b[^>]*>/i],
    ['an embedded Diagrams for Agents specification', /<script\b[^>]*id=["']diagrams-for-agents-spec["'][^>]*type=["']application\/json["']/i],
    ['a diagram family marker', /data-diagrams-for-agents-family=["'][a-z-]+["']/i],
  ];
  for (const [label, pattern] of required) if (!pattern.test(html)) errors.push(`Missing ${label}.`);

  const forbidden = [
    ['external scripts', /<script\b[^>]*\bsrc=/i],
    ['external stylesheets', /<link\b[^>]*rel=["']stylesheet["']/i],
    ['external images', /<img\b[^>]*\bsrc=/i],
    ['CSS imports', /@import\b/i],
    ['remote CSS assets', /url\(\s*["']?https?:/i],
    ['inline event handlers', /\son[a-z]+\s*=/i],
    ['unfinished placeholders', /\b(?:TODO|LOREM IPSUM|PLACEHOLDER)\b/i],
  ];
  for (const [label, pattern] of forbidden) if (pattern.test(html)) errors.push(`Contains ${label}.`);

  const match = html.match(/<script\b[^>]*id=["']diagrams-for-agents-spec["'][^>]*>([\s\S]*?)<\/script>/i);
  let spec;
  if (match) {
    try {
      spec = validateSpec(JSON.parse(match[1]));
    } catch (error) {
      errors.push(`Embedded spec is invalid: ${error.message}`);
    }
  }

  if (spec) {
    const familyMarker = html.match(/data-diagrams-for-agents-family=["']([^"']+)["']/i)?.[1];
    if (familyMarker !== spec.family) errors.push('SVG family marker does not match the embedded spec.');
    if (!html.includes(`<title id="diagrams-for-agents-title">`)) errors.push('SVG title must use the stable diagrams-for-agents-title ID.');
    if (!html.includes(`<desc id="diagrams-for-agents-desc">`)) errors.push('SVG description must use the stable diagrams-for-agents-desc ID.');
  }

  return { ok: errors.length === 0, errors, family: spec?.family, preset: spec?.preset };
}

async function cli(argv) {
  const [path] = argv;
  if (!path) {
    console.error('Usage: node validate-artifact.mjs artifact.html');
    process.exitCode = 2;
    return;
  }
  const result = validateArtifact(await readFile(path, 'utf8'));
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
