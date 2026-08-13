#!/usr/bin/env node
import { basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const UNSUPPORTED = /^(subgraph|end\b|classDef\b|class\b|style\b|linkStyle\b|click\b|accTitle\b|accDescr\b)/i;

function cleanLabel(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').replace(/<br\s*\/?>/gi, ' · ').trim();
}

function parseNode(token) {
  const value = token.trim().replace(/;$/, '');
  const match = value.match(/^([A-Za-z0-9_.-]+)(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\}|\[\[([^\]]+)\]\])?$/);
  if (!match) throw new Error(`Unsupported Mermaid node: ${token}`);
  return { id: match[1], label: cleanLabel(match[2] || match[3] || match[4] || match[5] || match[1]) };
}

export function importMermaid(source, title = 'Imported Mermaid flow') {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('%%'));
  const header = lines.shift();
  const headerMatch = header?.match(/^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)$/i);
  if (!headerMatch) throw new Error('Only Mermaid flowchart/graph sources with an explicit direction are supported.');

  const nodes = new Map();
  const edges = [];
  for (const [index, line] of lines.entries()) {
    if (UNSUPPORTED.test(line)) throw new Error(`Unsupported Mermaid syntax on line ${index + 2}: ${line}`);
    const edge = line.match(/^(.+?)\s*(-->|==>|-\.->)\s*(?:\|([^|]+)\|\s*)?(.+?)\s*;?$/);
    if (edge) {
      const from = parseNode(edge[1]);
      const to = parseNode(edge[4]);
      nodes.set(from.id, nodes.get(from.id) || from);
      nodes.set(to.id, nodes.get(to.id) || to);
      edges.push({ from: from.id, to: to.id, ...(edge[3] ? { label: cleanLabel(edge[3]) } : {}) });
      continue;
    }
    const node = parseNode(line);
    nodes.set(node.id, nodes.get(node.id) || node);
  }
  if (nodes.size < 2 || nodes.size > 9) throw new Error('Imported flows must contain 2–9 nodes. Split larger diagrams into overview and detail.');
  if (edges.length < 1 || edges.length > 12) throw new Error('Imported flows must contain 1–12 directed edges.');

  return {
    version: '1.0',
    family: 'flow',
    preset: 'doc-wide',
    title,
    subtitle: `Redrawn from Mermaid · ${headerMatch[1].toUpperCase()} source`,
    source,
    data: { nodes: [...nodes.values()], edges },
  };
}

async function cli(argv) {
  const [inputPath, outputPath] = argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: node import-mermaid.mjs source.mmd output.kolam.json');
    process.exitCode = 2;
    return;
  }
  const source = await readFile(inputPath, 'utf8');
  const title = basename(inputPath).replace(/\.(mmd|mermaid|md)$/i, '').replace(/[-_]+/g, ' ');
  const spec = importMermaid(source, title);
  await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, family: 'flow', nodes: spec.data.nodes.length, edges: spec.data.edges.length, output: outputPath }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
