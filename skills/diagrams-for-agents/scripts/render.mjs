#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIAGRAMS_FOR_AGENTS_LOCAL_VERSION = '0.3.0';
// Local Mode deliberately exposes a bounded, schema-validated primitive set.
// Specialist syntax and the long-tail framework catalogue stay in Verified Mode.
export const SUPPORTED_FAMILIES = [
  'swot', 'quadrant', 'comparison', 'flow', 'timeline', 'architecture',
  'cycle', 'pyramid', 'stack', 'venn', 'swimlane', 'raci', 'sipoc', 'fishbone',
  'journey-map', 'capability-map', 'strategy-map',
];

const PRESETS = {
  'doc-wide': { width: 1200, height: 700 },
  'slide-16x9': { width: 1600, height: 900 },
  'social-square': { width: 1080, height: 1080 },
  fit: { width: 1200, height: 800 },
};

const DEFAULT_THEME = {
  paper: '#ffffff',
  surface: '#f4f6f5',
  ink: '#0b0b12',
  muted: '#5f6470',
  accent: '#10b4ab',
  accent2: '#f5d900',
  font: 'Avenir Next, Helvetica Neue, sans-serif',
  displayFont: 'Avenir Next, Helvetica Neue, sans-serif',
};

const BRAND_TONES = new Set(['editorial', 'system']);
const BRAND_DENSITIES = new Set(['relaxed', 'compact']);
const BRAND_CORNERS = new Set(['sharp', 'soft', 'round']);

const REQUIRED_EVIDENCE = new Set(['swot', 'quadrant', 'comparison']);

function fail(message) {
  throw new Error(`Diagrams for Agents spec: ${message}`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value, name, max = 500) {
  if (typeof value !== 'string' || !value.trim()) fail(`${name} must be a non-empty string.`);
  if (value.length > max) fail(`${name} is too long (max ${max} characters).`);
  return value.trim();
}

function boundedArray(value, name, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${name} must contain ${min}–${max} items.`);
  }
  return value;
}

function normalizeEvidence(value) {
  return String(value).toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function claim(item, path, source, evidenceRequired) {
  if (!isPlainObject(item)) fail(`${path} must be an object.`);
  const label = nonEmptyString(item.label, `${path}.label`, 120);
  const evidence = typeof item.evidence === 'string' ? item.evidence.trim() : '';
  if (evidenceRequired && !evidence) fail(`${path}.evidence is required.`);
  if (evidence) {
    if (!source) fail(`${path}.evidence was supplied without top-level source text.`);
    if (!normalizeEvidence(source).includes(normalizeEvidence(evidence))) {
      fail(`${path}.evidence is not an exact quote from source.`);
    }
  }
  return { ...item, label, evidence };
}

function safeTheme(input, base = DEFAULT_THEME) {
  const theme = { ...DEFAULT_THEME, ...base, ...(isPlainObject(input) ? input : {}) };
  for (const token of ['paper', 'surface', 'ink', 'muted', 'accent', 'accent2']) {
    if (!/^#[0-9a-f]{6}$/i.test(theme[token])) fail(`theme.${token} must be a six-digit hex colour.`);
  }
  for (const token of ['font', 'displayFont']) {
    if (typeof theme[token] !== 'string' || !/^[a-z0-9 ,_'"-]{2,120}$/i.test(theme[token])) {
      fail(`theme.${token} contains unsupported characters. Use a local/system font stack.`);
    }
  }
  return theme;
}

function validateBrand(value) {
  if (value === undefined) return { name: '', guidance: '', theme: DEFAULT_THEME, style: { tone: 'editorial', density: 'relaxed', corner: 'soft' } };
  if (!isPlainObject(value)) fail('brand must be an object.');
  const name = value.name === undefined || value.name === '' ? '' : nonEmptyString(value.name, 'brand.name', 80);
  const guidance = typeof value.guidance === 'string' ? value.guidance.trim().slice(0, 600) : '';
  const style = isPlainObject(value.style) ? value.style : {};
  const tone = style.tone ?? 'editorial';
  const density = style.density ?? 'relaxed';
  const corner = style.corner ?? 'soft';
  if (!BRAND_TONES.has(tone)) fail('brand.style.tone must be editorial or system.');
  if (!BRAND_DENSITIES.has(density)) fail('brand.style.density must be relaxed or compact.');
  if (!BRAND_CORNERS.has(corner)) fail('brand.style.corner must be sharp, soft, or round.');
  return { name, guidance, theme: safeTheme(value.theme), style: { tone, density, corner } };
}

function validateBrief(value) {
  if (value === undefined) return { decision: '', audience: '', owner: '', asOf: '' };
  if (!isPlainObject(value)) fail('brief must be an object.');
  const string = (key, max) => value[key] === undefined || value[key] === '' ? '' : nonEmptyString(value[key], `brief.${key}`, max);
  return { decision: string('decision', 140), audience: string('audience', 80), owner: string('owner', 80), asOf: string('asOf', 40) };
}

function validateGraph(data, family) {
  const nodes = boundedArray(data.nodes, 'data.nodes', 2, 9).map((node, index) => {
    if (!isPlainObject(node)) fail(`data.nodes[${index}] must be an object.`);
    return {
      ...node,
      id: nonEmptyString(node.id, `data.nodes[${index}].id`, 40),
      label: nonEmptyString(node.label, `data.nodes[${index}].label`, 80),
      detail: typeof node.detail === 'string' ? node.detail.trim().slice(0, 140) : '',
      focal: Boolean(node.focal),
    };
  });
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) fail('data.nodes IDs must be unique.');
  const edges = boundedArray(data.edges ?? [], 'data.edges', family === 'flow' ? 1 : 0, 12).map((edge, index) => {
    if (!isPlainObject(edge)) fail(`data.edges[${index}] must be an object.`);
    const from = nonEmptyString(edge.from, `data.edges[${index}].from`, 40);
    const to = nonEmptyString(edge.to, `data.edges[${index}].to`, 40);
    if (!ids.has(from) || !ids.has(to)) fail(`data.edges[${index}] references an unknown node.`);
    if (from === to) fail(`data.edges[${index}] cannot connect a node to itself.`);
    return {
      from,
      to,
      label: typeof edge.label === 'string' ? edge.label.trim().slice(0, 60) : '',
    };
  });
  return { nodes, edges };
}

function validateItems(value, name, source, min = 1, max = 8) {
  return boundedArray(value, name, min, max).map((item, index) => claim(item, `${name}[${index}]`, source, false));
}

function validateLocalPrimitive(data, family, source) {
  if (['cycle', 'pyramid', 'stack'].includes(family)) {
    return { levels: validateItems(data.levels ?? data.stages, 'data.levels', source, 2, 8) };
  }
  if (family === 'venn') {
    return {
      sets: validateItems(data.sets, 'data.sets', source, 2, 3),
      overlapLabel: typeof data.overlapLabel === 'string' ? data.overlapLabel.trim().slice(0, 80) : '',
    };
  }
  if (family === 'sipoc') {
    const result = {};
    for (const key of ['suppliers', 'inputs', 'processSteps', 'outputs', 'customers']) {
      result[key] = validateItems(data[key], `data.${key}`, source, 1, 5);
    }
    return result;
  }
  if (family === 'raci') {
    const roles = boundedArray(data.roles, 'data.roles', 2, 6).map((role, index) => ({
      id: nonEmptyString(role?.id, `data.roles[${index}].id`, 40),
      label: nonEmptyString(role?.label, `data.roles[${index}].label`, 60),
    }));
    const activities = boundedArray(data.activities, 'data.activities', 2, 7).map((activity, index) => ({
      id: nonEmptyString(activity?.id, `data.activities[${index}].id`, 40),
      label: nonEmptyString(activity?.label, `data.activities[${index}].label`, 80),
    }));
    const roleIds = new Set(roles.map((role) => role.id));
    const activityIds = new Set(activities.map((activity) => activity.id));
    if (roleIds.size !== roles.length || activityIds.size !== activities.length) fail('data.raci role and activity IDs must be unique.');
    const assignments = boundedArray(data.assignments, 'data.assignments', activities.length, activities.length * roles.length).map((entry, index) => {
      const activity = nonEmptyString(entry?.activity, `data.assignments[${index}].activity`, 40);
      const role = nonEmptyString(entry?.role, `data.assignments[${index}].role`, 40);
      const value = nonEmptyString(entry?.value, `data.assignments[${index}].value`, 1).toUpperCase();
      if (!activityIds.has(activity) || !roleIds.has(role)) fail(`data.assignments[${index}] references an unknown role or activity.`);
      if (!['R', 'A', 'C', 'I'].includes(value)) fail(`data.assignments[${index}].value must be R, A, C, or I.`);
      return { activity, role, value };
    });
    for (const activity of activities) {
      const owners = assignments.filter((entry) => entry.activity === activity.id && (entry.value === 'R' || entry.value === 'A'));
      if (!owners.some((entry) => entry.value === 'R') || !owners.some((entry) => entry.value === 'A')) {
        fail(`data.raci activity "${activity.id}" needs one Responsible and one Accountable role.`);
      }
    }
    return { roles, activities, assignments };
  }
  if (family === 'swimlane') {
    const lanes = boundedArray(data.lanes, 'data.lanes', 2, 5).map((lane, index) => ({
      label: nonEmptyString(lane?.label, `data.lanes[${index}].label`, 60),
      steps: boundedArray(lane?.steps, `data.lanes[${index}].steps`, 1, 6).map((step, stepIndex) => nonEmptyString(step, `data.lanes[${index}].steps[${stepIndex}]`, 80)),
    }));
    return { lanes };
  }
  if (family === 'fishbone') {
    return {
      effect: nonEmptyString(data.effect, 'data.effect', 100),
      categories: boundedArray(data.categories, 'data.categories', 2, 6).map((category, index) => ({
        label: nonEmptyString(category?.label, `data.categories[${index}].label`, 60),
        causes: validateItems(category?.causes, `data.categories[${index}].causes`, source, 1, 4),
      })),
    };
  }
  if (family === 'journey-map') {
    return {
      persona: typeof data.persona === 'string' ? data.persona.trim().slice(0, 80) : '',
      stages: boundedArray(data.stages, 'data.stages', 2, 6).map((stage, index) => ({
        label: nonEmptyString(stage?.label, `data.stages[${index}].label`, 60),
        action: nonEmptyString(stage?.action, `data.stages[${index}].action`, 100),
        pain: typeof stage?.pain === 'string' ? stage.pain.trim().slice(0, 100) : '',
        opportunity: typeof stage?.opportunity === 'string' ? stage.opportunity.trim().slice(0, 100) : '',
      })),
    };
  }
  if (family === 'capability-map') {
    return {
      levels: validateItems(data.levels, 'data.levels', source, 2, 4),
      domains: boundedArray(data.domains, 'data.domains', 2, 6).map((domain, index) => ({
        label: nonEmptyString(domain?.label, `data.domains[${index}].label`, 60),
        capabilities: validateItems(domain?.capabilities, `data.domains[${index}].capabilities`, source, 1, 6),
      })),
    };
  }
  if (family === 'strategy-map') {
    const result = {};
    for (const key of ['financial', 'customer', 'internalProcess', 'learningGrowth']) {
      result[key] = validateItems(data[key], `data.${key}`, source, 1, 5);
    }
    return result;
  }
  fail(`unsupported local primitive: ${family}.`);
}

export function validateSpec(raw) {
  if (!isPlainObject(raw)) fail('root must be a JSON object.');
  const family = nonEmptyString(raw.family, 'family', 40).toLowerCase();
  if (!SUPPORTED_FAMILIES.includes(family)) fail(`family must be one of: ${SUPPORTED_FAMILIES.join(', ')}.`);
  const preset = raw.preset || 'doc-wide';
  if (!PRESETS[preset]) fail(`preset must be one of: ${Object.keys(PRESETS).join(', ')}.`);
  const title = nonEmptyString(raw.title, 'title', 120);
  const subtitle = typeof raw.subtitle === 'string' ? raw.subtitle.trim().slice(0, 220) : '';
  const source = typeof raw.source === 'string' ? raw.source.trim() : '';
  const brand = validateBrand(raw.brand);
  const brief = validateBrief(raw.brief);
  const theme = safeTheme(raw.theme, brand.theme);
  const data = isPlainObject(raw.data) ? raw.data : fail('data must be an object.');
  const evidenceRequired = REQUIRED_EVIDENCE.has(family);
  let validatedData;

  if (family === 'swot') {
    validatedData = {};
    for (const section of ['strengths', 'weaknesses', 'opportunities', 'threats']) {
      validatedData[section] = boundedArray(data[section], `data.${section}`, 1, 4)
        .map((item, index) => claim(item, `data.${section}[${index}]`, source, evidenceRequired));
    }
  } else if (family === 'quadrant') {
    if (!isPlainObject(data.axes)) fail('data.axes must be an object.');
    const axes = {};
    for (const key of ['xLow', 'xHigh', 'yLow', 'yHigh']) axes[key] = nonEmptyString(data.axes[key], `data.axes.${key}`, 50);
    const points = boundedArray(data.points, 'data.points', 2, 8).map((item, index) => {
      const checked = claim(item, `data.points[${index}]`, source, evidenceRequired);
      const x = Number(item.x);
      const y = Number(item.y);
      if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
        fail(`data.points[${index}] x and y must be between 0 and 1.`);
      }
      return { ...checked, x, y, focal: Boolean(item.focal) };
    });
    validatedData = { axes, points };
  } else if (family === 'comparison') {
    const columns = boundedArray(data.columns, 'data.columns', 2, 4).map((column, columnIndex) => {
      if (!isPlainObject(column)) fail(`data.columns[${columnIndex}] must be an object.`);
      return {
        title: nonEmptyString(column.title, `data.columns[${columnIndex}].title`, 60),
        focal: Boolean(column.focal),
        items: boundedArray(column.items, `data.columns[${columnIndex}].items`, 1, 5)
          .map((item, itemIndex) => claim(item, `data.columns[${columnIndex}].items[${itemIndex}]`, source, evidenceRequired)),
      };
    });
    validatedData = { columns };
  } else if (family === 'timeline') {
    const items = boundedArray(data.items, 'data.items', 2, 8).map((item, index) => {
      if (!isPlainObject(item)) fail(`data.items[${index}] must be an object.`);
      return {
        date: nonEmptyString(item.date, `data.items[${index}].date`, 40),
        label: nonEmptyString(item.label, `data.items[${index}].label`, 90),
        detail: typeof item.detail === 'string' ? item.detail.trim().slice(0, 160) : '',
        focal: Boolean(item.focal),
      };
    });
    validatedData = { items };
  } else if (family === 'flow' || family === 'architecture') {
    validatedData = validateGraph(data, family);
  } else {
    validatedData = validateLocalPrimitive(data, family, source);
  }

  return {
    version: '1.0', family, preset, title, subtitle, source, theme, brand: { ...brand, theme }, brief, data: validatedData,
  };
}

function x(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
}

function wrap(text, maxChars = 28, maxLines = 3) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    clipped[maxLines - 1] = `${clipped[maxLines - 1].slice(0, Math.max(1, maxChars - 1))}…`;
    return clipped;
  }
  return lines;
}

function textLines(text, px, py, { size = 18, weight = 500, fill = 'var(--ink)', max = 30, lines = 3, anchor = 'start', leading = 1.25, cls = '' } = {}) {
  return `<text x="${px}" y="${py}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}" class="${cls}">${wrap(text, max, lines).map((line, index) => `<tspan x="${px}" dy="${index === 0 ? 0 : size * leading}">${x(line)}</tspan>`).join('')}</text>`;
}

function baseParts(spec) {
  const { width, height } = PRESETS[spec.preset];
  const margin = spec.preset === 'slide-16x9' ? 84 : 64;
  const header = spec.preset === 'social-square' ? 166 : 132;
  const footer = 58;
  const radius = spec.brand.style.corner === 'sharp' ? 2 : spec.brand.style.corner === 'round' ? 16 : 8;
  const density = spec.brand.style.density === 'compact' ? 0.88 : 1;
  return { width, height, margin, header, footer, radius, density, contentW: width - margin * 2, contentH: height - header - footer };
}

function swotSvg(spec, box) {
  const gap = 18;
  const cardW = (box.contentW - gap) / 2;
  const cardH = (box.contentH - gap) / 2;
  const sections = [
    ['strengths', 'Strengths', '01'], ['weaknesses', 'Weaknesses', '02'],
    ['opportunities', 'Opportunities', '03'], ['threats', 'Threats', '04'],
  ];
  return sections.map(([key, label, number], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const px = box.margin + col * (cardW + gap);
    const py = box.header + row * (cardH + gap);
    const focal = key === 'strengths' || key === 'opportunities';
    const items = spec.data[key];
    const itemGap = Math.min(58, (cardH - 104) / Math.max(1, items.length));
    return `<g>
      <rect x="${px}" y="${py}" width="${cardW}" height="${cardH}" rx="8" fill="${focal ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${focal ? 'var(--accent)' : 'var(--rule)'}"/>
      <text x="${px + 24}" y="${py + 34}" class="eyebrow">${number}</text>
      <text x="${px + 64}" y="${py + 36}" font-size="19" font-weight="700">${label}</text>
      <line x1="${px + 24}" y1="${py + 54}" x2="${px + cardW - 24}" y2="${py + 54}" stroke="var(--rule)"/>
      ${items.map((item, itemIndex) => {
        const iy = py + 84 + itemIndex * itemGap;
        return `<circle cx="${px + 31}" cy="${iy - 5}" r="4" fill="${focal ? 'var(--accent)' : 'var(--ink)'}"/>${textLines(item.label, px + 48, iy, { size: 16, max: Math.max(24, Math.floor(cardW / 13)), lines: 2 })}`;
      }).join('')}
    </g>`;
  }).join('');
}

function quadrantSvg(spec, box) {
  const left = box.margin + 92;
  const top = box.header + 26;
  const w = box.contentW - 132;
  const h = box.contentH - 76;
  const { axes, points } = spec.data;
  return `<g>
    <rect x="${left}" y="${top}" width="${w}" height="${h}" fill="var(--paper-2)" stroke="var(--rule)"/>
    <line x1="${left + w / 2}" y1="${top}" x2="${left + w / 2}" y2="${top + h}" stroke="var(--rule)" stroke-dasharray="5 7"/>
    <line x1="${left}" y1="${top + h / 2}" x2="${left + w}" y2="${top + h / 2}" stroke="var(--rule)" stroke-dasharray="5 7"/>
    <text x="${left}" y="${top + h + 34}" class="axis">${x(axes.xLow)}</text>
    <text x="${left + w}" y="${top + h + 34}" text-anchor="end" class="axis">${x(axes.xHigh)}</text>
    <text x="${left - 24}" y="${top + h}" text-anchor="end" class="axis">${x(axes.yLow)}</text>
    <text x="${left - 24}" y="${top + 8}" text-anchor="end" class="axis">${x(axes.yHigh)}</text>
    ${points.map((point) => {
      const px = left + point.x * w;
      const py = top + (1 - point.y) * h;
      return `<g><circle cx="${px}" cy="${py}" r="${point.focal ? 11 : 8}" fill="${point.focal ? 'var(--accent)' : 'var(--ink)'}" stroke="var(--paper)" stroke-width="3"/>${textLines(point.label, px + 14, py - 12, { size: 14, weight: 650, max: 22, lines: 2 })}</g>`;
    }).join('')}
  </g>`;
}

function comparisonSvg(spec, box) {
  const gap = 16;
  const columns = spec.data.columns;
  const cardW = (box.contentW - gap * (columns.length - 1)) / columns.length;
  const cardH = box.contentH - 20;
  return columns.map((column, index) => {
    const px = box.margin + index * (cardW + gap);
    const py = box.header + 10;
    const rowH = (cardH - 86) / column.items.length;
    return `<g>
      <rect x="${px}" y="${py}" width="${cardW}" height="${cardH}" rx="8" fill="${column.focal ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${column.focal ? 'var(--accent)' : 'var(--rule)'}"/>
      ${textLines(column.title, px + 24, py + 38, { size: 19, weight: 720, max: Math.max(16, Math.floor(cardW / 12)), lines: 2 })}
      <line x1="${px + 22}" y1="${py + 68}" x2="${px + cardW - 22}" y2="${py + 68}" stroke="var(--rule)"/>
      ${column.items.map((item, itemIndex) => {
        const iy = py + 99 + itemIndex * rowH;
        return `<path d="M ${px + 25} ${iy - 5} l 4 4 l 8 -9" fill="none" stroke="${column.focal ? 'var(--accent)' : 'var(--muted)'}" stroke-width="2"/>${textLines(item.label, px + 48, iy, { size: 15, max: Math.max(18, Math.floor(cardW / 11)), lines: 2 })}`;
      }).join('')}
    </g>`;
  }).join('');
}

function graphLayout(spec, box, architecture = false) {
  const nodes = spec.data.nodes;
  const cols = architecture ? Math.min(3, nodes.length) : Math.min(nodes.length, 4);
  const rows = Math.ceil(nodes.length / cols);
  const gapX = 34;
  const gapY = 46;
  const nodeW = (box.contentW - gapX * (cols - 1)) / cols;
  const nodeH = Math.min(148, (box.contentH - 40 - gapY * (rows - 1)) / rows);
  const positions = new Map();
  nodes.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    positions.set(node.id, {
      ...node,
      x: box.margin + col * (nodeW + gapX),
      y: box.header + 18 + row * (nodeH + gapY),
      w: nodeW,
      h: nodeH,
    });
  });
  return { positions, nodeW, nodeH };
}

function graphSvg(spec, box, architecture = false) {
  const { positions } = graphLayout(spec, box, architecture);
  const edges = spec.data.edges.map((edge) => {
    const a = positions.get(edge.from);
    const b = positions.get(edge.to);
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h / 2;
    const x2 = b.x + b.w / 2;
    const y2 = b.y + b.h / 2;
    const sameRow = Math.abs(y1 - y2) < 4;
    const path = sameRow
      ? `M ${a.x + a.w} ${y1} H ${b.x}`
      : `M ${x1} ${a.y + a.h} V ${(a.y + a.h + b.y) / 2} H ${x2} V ${b.y}`;
    const labelX = sameRow ? (a.x + a.w + b.x) / 2 : x2 + 10;
    const labelY = sameRow ? y1 - 10 : (a.y + a.h + b.y) / 2 - 9;
    return `<g><path d="${path}" fill="none" stroke="var(--muted)" stroke-width="2" marker-end="url(#arrow)"/>${edge.label ? `<text x="${labelX}" y="${labelY}" text-anchor="middle" class="edge-label">${x(edge.label)}</text>` : ''}</g>`;
  }).join('');
  const nodes = [...positions.values()].map((node, index) => `<g>
    <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8" fill="${node.focal ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${node.focal ? 'var(--accent)' : 'var(--rule-strong)'}"/>
    <text x="${node.x + 20}" y="${node.y + 25}" class="eyebrow">${String(index + 1).padStart(2, '0')}</text>
    ${textLines(node.label, node.x + 20, node.y + 56, { size: 18, weight: 720, max: Math.max(18, Math.floor(node.w / 11)), lines: 2 })}
    ${node.detail ? textLines(node.detail, node.x + 20, node.y + 102, { size: 13, weight: 450, fill: 'var(--muted)', max: Math.max(22, Math.floor(node.w / 9)), lines: 2 }) : ''}
  </g>`).join('');
  return edges + nodes;
}

function timelineSvg(spec, box) {
  const items = spec.data.items;
  const left = box.margin + 52;
  const right = box.width - box.margin - 52;
  const y = box.header + box.contentH * 0.48;
  const step = (right - left) / (items.length - 1);
  return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="var(--rule-strong)" stroke-width="2"/>${items.map((item, index) => {
    const px = left + index * step;
    const above = index % 2 === 0;
    const focal = item.focal;
    const lineEnd = y + (above ? -96 : 96);
    return `<g>
      <line x1="${px}" y1="${y}" x2="${px}" y2="${lineEnd}" stroke="${focal ? 'var(--accent)' : 'var(--rule-strong)'}"/>
      <circle cx="${px}" cy="${y}" r="${focal ? 10 : 7}" fill="${focal ? 'var(--accent)' : 'var(--ink)'}" stroke="var(--paper)" stroke-width="3"/>
      <text x="${px}" y="${lineEnd + (above ? -30 : 26)}" text-anchor="middle" class="eyebrow">${x(item.date)}</text>
      ${textLines(item.label, px, lineEnd + (above ? -6 : 50), { size: 16, weight: 680, max: 18, lines: 2, anchor: 'middle' })}
      ${item.detail ? textLines(item.detail, px, lineEnd + (above ? 38 : 98), { size: 12, fill: 'var(--muted)', max: 22, lines: 2, anchor: 'middle' }) : ''}
    </g>`;
  }).join('')}`;
}

function card(x0, y0, width, height, label, detail = '', focal = false, index = '') {
  return `<g><rect x="${x0}" y="${y0}" width="${width}" height="${height}" rx="8" fill="${focal ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${focal ? 'var(--accent)' : 'var(--rule-strong)'}"/>
    ${index ? `<text x="${x0 + 16}" y="${y0 + 22}" class="eyebrow">${x(index)}</text>` : ''}
    ${textLines(label, x0 + 18, y0 + (index ? 48 : 30), { size: 16, weight: 720, max: Math.max(14, Math.floor(width / 10)), lines: 2 })}
    ${detail ? textLines(detail, x0 + 18, y0 + height - 26, { size: 12, fill: 'var(--muted)', max: Math.max(16, Math.floor(width / 9)), lines: 2 }) : ''}</g>`;
}

function cycleSvg(spec, box) {
  const items = spec.data.levels;
  const cx = box.width / 2;
  const cy = box.header + box.contentH / 2;
  const radius = Math.min(box.contentW, box.contentH) * 0.28;
  const cardW = Math.min(220, box.contentW / 3.8);
  const cardH = 78;
  return `<circle cx="${cx}" cy="${cy}" r="${radius * 0.45}" fill="var(--accent-soft)" stroke="var(--accent)"/><text x="${cx}" y="${cy - 5}" text-anchor="middle" class="eyebrow">REINFORCING</text>${textLines('Loop', cx, cy + 24, { size: 22, weight: 760, anchor: 'middle', max: 12, lines: 1 })}
  ${items.map((item, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / items.length;
    const px = cx + Math.cos(angle) * radius - cardW / 2;
    const py = cy + Math.sin(angle) * radius - cardH / 2;
    const next = -Math.PI / 2 + (Math.PI * 2 * (index + 0.55)) / items.length;
    const x1 = cx + Math.cos(angle) * (radius * 0.72);
    const y1 = cy + Math.sin(angle) * (radius * 0.72);
    const x2 = cx + Math.cos(next) * (radius * 0.72);
    const y2 = cy + Math.sin(next) * (radius * 0.72);
    return `<path d="M ${x1} ${y1} A ${radius * 0.72} ${radius * 0.72} 0 0 1 ${x2} ${y2}" fill="none" stroke="var(--muted)" stroke-width="2" marker-end="url(#arrow)"/>${card(px, py, cardW, cardH, item.label, item.description || '', index === 0, String(index + 1).padStart(2, '0'))}`;
  }).join('')}`;
}

function layersSvg(spec, box, pyramid = false) {
  const items = spec.data.levels;
  const h = Math.min(86, (box.contentH - 24) / items.length);
  const center = box.width / 2;
  const maxW = box.contentW * 0.86;
  return items.map((item, index) => {
    const y0 = box.header + 16 + index * h;
    const width = pyramid ? maxW * (0.42 + ((index + 1) / items.length) * 0.58) : maxW;
    const x0 = center - width / 2;
    const points = pyramid ? `${x0 + 18},${y0} ${x0 + width - 18},${y0} ${x0 + width},${y0 + h - 8} ${x0},${y0 + h - 8}` : '';
    return `<g>${pyramid ? `<polygon points="${points}" fill="${index === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${index === 0 ? 'var(--accent)' : 'var(--rule-strong)'}"/>` : `<rect x="${x0}" y="${y0}" width="${width}" height="${h - 8}" rx="6" fill="${index === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${index === 0 ? 'var(--accent)' : 'var(--rule-strong)'}"/>`}
      <text x="${center}" y="${y0 + 31}" text-anchor="middle" class="eyebrow">${String(index + 1).padStart(2, '0')}</text>${textLines(item.label, center, y0 + 55, { size: 17, weight: 720, anchor: 'middle', max: Math.max(18, Math.floor(width / 10)), lines: 1 })}</g>`;
  }).join('');
}

function vennSvg(spec, box) {
  const sets = spec.data.sets;
  const cx = box.width / 2;
  const cy = box.header + box.contentH / 2;
  const radius = Math.min(box.contentH * 0.31, box.contentW / 5);
  const positions = sets.length === 2 ? [[cx - radius * 0.58, cy], [cx + radius * 0.58, cy]] : [[cx, cy - radius * 0.5], [cx - radius * 0.62, cy + radius * 0.38], [cx + radius * 0.62, cy + radius * 0.38]];
  return `${sets.map((item, index) => `<circle cx="${positions[index][0]}" cy="${positions[index][1]}" r="${radius}" fill="${index === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${index === 0 ? 'var(--accent)' : 'var(--rule-strong)'}" stroke-width="2"/>${textLines(item.label, positions[index][0], positions[index][1] - radius - 14, { size: 16, weight: 720, anchor: 'middle', max: 18, lines: 2 })}`).join('')}
  ${spec.data.overlapLabel ? textLines(spec.data.overlapLabel, cx, cy + 5, { size: 16, weight: 760, anchor: 'middle', max: 20, lines: 2 }) : ''}`;
}

function columnsSvg(spec, box, columns) {
  const gap = 10;
  const width = (box.contentW - gap * (columns.length - 1)) / columns.length;
  const height = box.contentH - 18;
  return columns.map((column, index) => {
    const x0 = box.margin + index * (width + gap);
    const rowH = (height - 70) / column.items.length;
    return `<g><rect x="${x0}" y="${box.header + 8}" width="${width}" height="${height}" rx="7" fill="${index === 2 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${index === 2 ? 'var(--accent)' : 'var(--rule)'}"/>${textLines(column.title, x0 + 16, box.header + 38, { size: 15, weight: 760, max: Math.max(12, Math.floor(width / 11)), lines: 2 })}<line x1="${x0 + 14}" y1="${box.header + 56}" x2="${x0 + width - 14}" y2="${box.header + 56}" stroke="var(--rule)"/>${column.items.map((item, itemIndex) => textLines(item.label, x0 + 16, box.header + 82 + itemIndex * rowH, { size: 13, weight: 540, max: Math.max(12, Math.floor(width / 9)), lines: 2 })).join('')}</g>`;
  }).join('');
}

function sipocSvg(spec, box) {
  return columnsSvg(spec, box, [
    { title: 'Suppliers', items: spec.data.suppliers }, { title: 'Inputs', items: spec.data.inputs },
    { title: 'Process', items: spec.data.processSteps }, { title: 'Outputs', items: spec.data.outputs }, { title: 'Customers', items: spec.data.customers },
  ]);
}

function raciSvg(spec, box) {
  const { roles, activities, assignments } = spec.data;
  const firstW = Math.min(300, box.contentW * 0.42);
  const columnW = (box.contentW - firstW) / roles.length;
  const rowH = Math.min(64, (box.contentH - 8) / (activities.length + 1));
  const assignment = new Map(assignments.map((entry) => [`${entry.activity}:${entry.role}`, entry.value]));
  const top = box.header + 8;
  return `<g><rect x="${box.margin}" y="${top}" width="${firstW}" height="${rowH}" fill="var(--ink)"/>${textLines('Activity', box.margin + 16, top + 38, { size: 15, weight: 720, fill: 'var(--paper)', max: 20, lines: 1 })}${roles.map((role, index) => `<rect x="${box.margin + firstW + index * columnW}" y="${top}" width="${columnW}" height="${rowH}" fill="${index === 0 ? 'var(--accent)' : 'var(--ink)'}"/>${textLines(role.label, box.margin + firstW + index * columnW + columnW / 2, top + 34, { size: 13, weight: 720, fill: 'var(--paper)', anchor: 'middle', max: 12, lines: 2 })}`).join('')}${activities.map((activity, row) => {
    const y0 = top + rowH * (row + 1);
    return `<rect x="${box.margin}" y="${y0}" width="${firstW}" height="${rowH}" fill="var(--paper-2)" stroke="var(--rule)"/>${textLines(activity.label, box.margin + 16, y0 + 37, { size: 14, weight: 650, max: Math.floor(firstW / 10), lines: 2 })}${roles.map((role, index) => { const value = assignment.get(`${activity.id}:${role.id}`) || ''; const px = box.margin + firstW + index * columnW; return `<rect x="${px}" y="${y0}" width="${columnW}" height="${rowH}" fill="${value === 'A' || value === 'R' ? 'var(--accent-soft)' : 'var(--paper)'}" stroke="var(--rule)"/>${value ? `<text x="${px + columnW / 2}" y="${y0 + 38}" text-anchor="middle" font-size="18" font-weight="760">${value}</text>` : ''}`; }).join('')}`; }).join('')}</g>`;
}

function swimlaneSvg(spec, box) {
  const lanes = spec.data.lanes;
  const labelW = Math.min(180, box.contentW * 0.2);
  const laneH = (box.contentH - 8) / lanes.length;
  return lanes.map((lane, row) => {
    const y0 = box.header + 8 + row * laneH;
    const stepW = (box.contentW - labelW - 16) / lane.steps.length;
    return `<g><rect x="${box.margin}" y="${y0}" width="${labelW}" height="${laneH - 8}" fill="${row === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="var(--rule-strong)"/>${textLines(lane.label, box.margin + 16, y0 + laneH / 2, { size: 15, weight: 760, max: 14, lines: 2 })}${lane.steps.map((step, index) => card(box.margin + labelW + 12 + index * stepW, y0 + 8, stepW - 12, laneH - 24, step, '', row === 0 && index === 0)).join('')}</g>`;
  }).join('');
}

function fishboneSvg(spec, box) {
  const categories = spec.data.categories;
  const left = box.margin + 30;
  const right = box.width - box.margin - 180;
  const mid = box.header + box.contentH / 2;
  return `<line x1="${left}" y1="${mid}" x2="${right}" y2="${mid}" stroke="var(--ink)" stroke-width="3" marker-end="url(#arrow)"/>${card(right + 20, mid - 42, 140, 84, spec.data.effect, '', true)}${categories.map((category, index) => {
    const x0 = left + 90 + index * ((right - left - 160) / Math.max(1, categories.length - 1));
    const up = index % 2 === 0;
    const y0 = up ? mid - 130 : mid + 130;
    const stem = up ? mid - 12 : mid + 12;
    return `<line x1="${x0}" y1="${stem}" x2="${x0 - 52}" y2="${y0}" stroke="var(--muted)" stroke-width="2"/>${textLines(category.label, x0 - 58, y0 + (up ? -12 : 20), { size: 14, weight: 760, anchor: 'middle', max: 15, lines: 2 })}${category.causes.map((cause, causeIndex) => textLines(cause.label, x0 - 76, y0 + (up ? -42 - causeIndex * 34 : 52 + causeIndex * 34), { size: 12, fill: 'var(--muted)', anchor: 'middle', max: 18, lines: 2 })).join('')}`;
  }).join('')}`;
}

function journeySvg(spec, box) {
  const { stages, persona } = spec.data;
  const columns = stages.map((stage) => ({ title: stage.label, items: [{ label: stage.action }, ...(stage.pain ? [{ label: `Pain: ${stage.pain}` }] : []), ...(stage.opportunity ? [{ label: `Opportunity: ${stage.opportunity}` }] : [])] }));
  return `${persona ? `<text x="${box.margin}" y="${box.header - 4}" class="eyebrow">PERSONA · ${x(persona)}</text>` : ''}${columnsSvg(spec, box, columns)}`;
}

function capabilitySvg(spec, box) {
  const { levels, domains } = spec.data;
  const headerH = 44;
  const colW = box.contentW / domains.length;
  const rowH = (box.contentH - headerH) / levels.length;
  return `${domains.map((domain, index) => `<rect x="${box.margin + index * colW}" y="${box.header + 8}" width="${colW}" height="${headerH}" fill="${index === 0 ? 'var(--accent)' : 'var(--ink)'}"/>${textLines(domain.label, box.margin + index * colW + colW / 2, box.header + 36, { size: 14, weight: 760, fill: 'var(--paper)', anchor: 'middle', max: 16, lines: 1 })}`).join('')}${levels.map((level, row) => { const y0 = box.header + 8 + headerH + row * rowH; return `<text x="${box.margin - 10}" y="${y0 + 26}" text-anchor="end" class="eyebrow">${x(level.label)}</text>${domains.map((domain, col) => { const item = domain.capabilities[row % domain.capabilities.length]; return `<rect x="${box.margin + col * colW}" y="${y0}" width="${colW}" height="${rowH - 6}" fill="var(--paper-2)" stroke="var(--rule)"/>${textLines(item.label, box.margin + col * colW + 14, y0 + 30, { size: 13, weight: 650, max: Math.max(12, Math.floor(colW / 10)), lines: 2 })}`; }).join('')}`; }).join('')}`;
}

function strategySvg(spec, box) {
  const rows = [['Financial', spec.data.financial], ['Customer', spec.data.customer], ['Internal process', spec.data.internalProcess], ['Learning & growth', spec.data.learningGrowth]];
  const rowH = (box.contentH - 8) / rows.length;
  return rows.map(([label, items], index) => {
    const y0 = box.header + 8 + index * rowH;
    const cardW = (box.contentW - 170) / items.length;
    return `<g><rect x="${box.margin}" y="${y0}" width="150" height="${rowH - 8}" fill="${index === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="var(--rule-strong)"/>${textLines(label, box.margin + 16, y0 + rowH / 2, { size: 15, weight: 760, max: 16, lines: 2 })}${items.map((item, itemIndex) => card(box.margin + 166 + itemIndex * cardW, y0 + 8, cardW - 12, rowH - 24, item.label, '', index === 0 && itemIndex === 0)).join('')}</g>`;
  }).join('');
}

function evidenceEntries(spec) {
  const entries = [];
  function visit(value) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (isPlainObject(value)) {
      if (typeof value.label === 'string' && typeof value.evidence === 'string' && value.evidence) {
        entries.push({ claim: value.label, quote: value.evidence });
      }
      Object.values(value).forEach(visit);
    }
  }
  visit(spec.data);
  return entries;
}

export function renderSvg(specInput) {
  const spec = validateSpec(specInput);
  const box = baseParts(spec);
  const body = spec.family === 'swot' ? swotSvg(spec, box)
    : spec.family === 'quadrant' ? quadrantSvg(spec, box)
      : spec.family === 'comparison' ? comparisonSvg(spec, box)
        : spec.family === 'timeline' ? timelineSvg(spec, box)
          : spec.family === 'cycle' ? cycleSvg(spec, box)
            : spec.family === 'pyramid' ? layersSvg(spec, box, true)
              : spec.family === 'stack' ? layersSvg(spec, box)
                : spec.family === 'venn' ? vennSvg(spec, box)
                  : spec.family === 'sipoc' ? sipocSvg(spec, box)
                    : spec.family === 'raci' ? raciSvg(spec, box)
                      : spec.family === 'swimlane' ? swimlaneSvg(spec, box)
                        : spec.family === 'fishbone' ? fishboneSvg(spec, box)
                          : spec.family === 'journey-map' ? journeySvg(spec, box)
                            : spec.family === 'capability-map' ? capabilitySvg(spec, box)
                              : spec.family === 'strategy-map' ? strategySvg(spec, box)
                                : graphSvg(spec, box, spec.family === 'architecture');
  const titleSize = spec.preset === 'slide-16x9' ? 42 : spec.preset === 'social-square' ? 38 : 32;
  const brief = [
    spec.brief.decision && `Decision · ${spec.brief.decision}`,
    spec.brief.audience && `For · ${spec.brief.audience}`,
    spec.brief.owner && `Owner · ${spec.brief.owner}`,
    spec.brief.asOf && `As of · ${spec.brief.asOf}`,
  ].filter(Boolean);
  const headerMeta = spec.brand.name || brief.length
    ? `<text x="${box.width - box.margin}" y="${box.margin + 8}" text-anchor="end" class="eyebrow">${x(spec.brand.name || `${spec.family} · ${spec.preset}`)}</text>${brief.length ? `<text x="${box.width - box.margin}" y="${box.margin + 30}" text-anchor="end" class="meta">${x(brief.join('  ·  '))}</text>` : ''}`
    : `<text x="${box.width - box.margin}" y="${box.margin + 8}" text-anchor="end" class="eyebrow">${x(spec.family)} · ${x(spec.preset)}</text>`;
  const paperTexture = spec.brand.style.tone === 'editorial'
    ? `<rect width="100%" height="100%" fill="url(#paper-grid)" opacity=".44"/>`
    : '';
  const rendered = `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="diagrams-for-agents-title diagrams-for-agents-desc" viewBox="0 0 ${box.width} ${box.height}" width="${box.width}" height="${box.height}" data-diagrams-for-agents-family="${spec.family}">
  <title id="diagrams-for-agents-title">${x(spec.title)}</title>
  <desc id="diagrams-for-agents-desc">${x(spec.subtitle || `${spec.family} diagram created with Diagrams for Agents Local`)}</desc>
  <style>
    :root{--paper:${spec.theme.paper};--paper-2:${spec.theme.surface};--ink:${spec.theme.ink};--muted:${spec.theme.muted};--accent:${spec.theme.accent};--accent-2:${spec.theme.accent2};--accent-soft:${spec.theme.accent}1c;--rule:${spec.theme.ink}20;--rule-strong:${spec.theme.ink}5c}
    text{font-family:${x(spec.theme.font)};fill:var(--ink)}
    .eyebrow,.axis,.edge-label,.meta{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.1em;fill:var(--muted)}
    .eyebrow{font-size:11px;font-weight:700}.meta{font-size:9px;font-weight:620;letter-spacing:.06em}.axis{font-size:11px;font-weight:650}.edge-label{font-size:10px;font-weight:650}
  </style>
  <defs><marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><path d="M0 0L8 3L0 6Z" fill="${spec.theme.muted}"/></marker><pattern id="paper-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="var(--rule)" stroke-width=".65"/></pattern></defs>
  <rect width="100%" height="100%" fill="var(--paper)"/>
  ${paperTexture}
  <rect x="${box.margin}" y="${box.margin - 20}" width="34" height="4" rx="2" fill="var(--accent)"/><rect x="${box.margin + 40}" y="${box.margin - 20}" width="12" height="4" rx="2" fill="var(--accent-2)"/>
  <text x="${box.margin}" y="${box.margin + 10}" font-family="${x(spec.theme.displayFont)}" font-size="${titleSize}" font-weight="760" letter-spacing="-.03em">${x(spec.title)}</text>
  ${spec.subtitle ? `<text x="${box.margin}" y="${box.margin + 42}" font-size="15" fill="var(--muted)">${x(spec.subtitle)}</text>` : ''}
  ${headerMeta}
  ${body}
  <line x1="${box.margin}" y1="${box.height - 42}" x2="${box.width - box.margin}" y2="${box.height - 42}" stroke="var(--rule)"/>
  <text x="${box.margin}" y="${box.height - 20}" class="eyebrow">${x(spec.brand.name ? `${spec.brand.name} · ` : '')}Diagrams for Agents Local · ${REQUIRED_EVIDENCE.has(spec.family) ? 'exact-quote grounded' : 'private render'}</text>
  <text x="${box.width - box.margin}" y="${box.height - 20}" text-anchor="end" class="eyebrow">v${DIAGRAMS_FOR_AGENTS_LOCAL_VERSION}</text>
</svg>`;
  // Resolve every semantic token in the standalone SVG. Browser CSS variables are fine
  // inside the HTML artifact, but many slide, Figma, and raster pipelines do not resolve
  // custom properties in imported SVGs.
  return rendered
    .replaceAll('var(--paper-2)', spec.theme.surface)
    .replaceAll('var(--paper)', spec.theme.paper)
    .replaceAll('var(--accent-2)', spec.theme.accent2)
    .replaceAll('var(--accent-soft)', `${spec.theme.accent}16`)
    .replaceAll('var(--accent)', spec.theme.accent)
    .replaceAll('var(--rule-strong)', `${spec.theme.ink}66`)
    .replaceAll('var(--rule)', `${spec.theme.ink}24`)
    .replaceAll('var(--muted)', spec.theme.muted)
    .replaceAll('var(--ink)', spec.theme.ink);
}

export function renderHtml(specInput) {
  const spec = validateSpec(specInput);
  const svg = renderSvg(spec);
  const evidence = evidenceEntries(spec);
  const safeJson = JSON.stringify(spec).replace(/</g, '\\u003c');
  const receipt = evidence.length
    ? `<details><summary>Grounding receipt · ${evidence.length} exact quotes</summary><ol>${evidence.map((entry) => `<li><strong>${x(entry.claim)}</strong><blockquote>${x(entry.quote)}</blockquote></li>`).join('')}</ol></details>`
    : '<p class="privacy">Private local render · no content was uploaded.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${x(spec.title)} · Diagrams for Agents</title>
<style>html{background:#e9ecef}body{margin:0;padding:32px;font-family:${x(spec.theme.font)};color:${spec.theme.ink}}main{max-width:1600px;margin:auto}.canvas{background:${spec.theme.paper};border:1px solid #0002;box-shadow:0 20px 60px #0001}.canvas svg{display:block;width:100%;height:auto}details,.privacy{margin:18px 0 0;background:${spec.theme.paper};border:1px solid #0002;padding:14px 18px;font-size:14px}summary{cursor:pointer;font-weight:700}li{margin:12px 0}blockquote{margin:6px 0;color:${spec.theme.muted}}footer{margin-top:12px;color:#60646c;font-size:12px}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}</style></head>
<body><main><div class="canvas">${svg}</div>${receipt}<footer>Source-editable artifact · embedded specification: <code>script#diagrams-for-agents-spec</code></footer></main>
<script id="diagrams-for-agents-spec" type="application/json">${safeJson}</script></body></html>`;
}

export function makeReceipt(specInput, outputs = {}) {
  const spec = validateSpec(specInput);
  const evidence = evidenceEntries(spec);
  const digest = createHash('sha256').update(JSON.stringify(spec)).digest('hex');
  return {
    schema: 'diagrams-for-agents-local-receipt/1.0',
    createdAt: new Date().toISOString(),
    rendererVersion: DIAGRAMS_FOR_AGENTS_LOCAL_VERSION,
    mode: 'local',
    family: spec.family,
    preset: spec.preset,
    evidence: {
      policy: REQUIRED_EVIDENCE.has(spec.family) ? 'exact-quote-required' : 'optional',
      claimsChecked: evidence.length,
    },
    specSha256: digest,
    outputs,
  };
}

async function emitOptInTelemetry(receipt) {
  if (process.env.DIAGRAMS_FOR_AGENTS_TELEMETRY !== '1') return;
  const url = process.env.DIAGRAMS_FOR_AGENTS_TELEMETRY_URL || 'https://diagramsforagents.pragmaticleaders.io/api/v1/telemetry';
  let anonymousId = process.env.DIAGRAMS_FOR_AGENTS_TELEMETRY_ID;
  if (!anonymousId) {
    try {
      const directory = process.env.DIAGRAMS_FOR_AGENTS_CONFIG_DIR || join(homedir(), '.config', 'diagrams-for-agents');
      const idPath = join(directory, 'telemetry-id');
      await mkdir(directory, { recursive: true });
      anonymousId = (await readFile(idPath, 'utf8').catch(async () => {
        const created = randomUUID();
        await writeFile(idPath, `${created}\n`, { encoding: 'utf8', mode: 0o600 });
        return created;
      })).trim();
    } catch {
      anonymousId = undefined;
    }
  }
  const payload = {
    event: 'local_render_succeeded',
    version: receipt.rendererVersion,
    family: receipt.family,
    preset: receipt.preset,
    claimsChecked: receipt.evidence.claimsChecked,
    ...(anonymousId ? { anonymousId } : {}),
  };
  try {
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Telemetry is explicitly opt-in and must never block a render.
  }
}

async function cli(argv) {
  const [inputPath, outputPath, ...rest] = argv;
  if (!inputPath || !outputPath) {
    console.error('Usage: node render.mjs input.diagrams-for-agents.json output.html [--svg output.svg] [--receipt output.receipt.json]');
    process.exitCode = 2;
    return;
  }
  const option = (name) => {
    const index = rest.indexOf(name);
    return index >= 0 ? rest[index + 1] : undefined;
  };
  const svgPath = option('--svg');
  const receiptPath = option('--receipt');
  const brandPath = option('--brand');
  const raw = JSON.parse(await readFile(inputPath, 'utf8'));
  if (brandPath) {
    if (raw.brand) fail('Use either a top-level brand object or --brand, not both.');
    raw.brand = JSON.parse(await readFile(brandPath, 'utf8'));
  }
  const spec = validateSpec(raw);
  await writeFile(outputPath, renderHtml(spec), 'utf8');
  if (svgPath) await writeFile(svgPath, renderSvg(spec), 'utf8');
  const receipt = makeReceipt(spec, { html: outputPath, ...(svgPath ? { svg: svgPath } : {}) });
  if (receiptPath) await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  await emitOptInTelemetry(receipt);
  console.log(JSON.stringify({ ok: true, family: spec.family, preset: spec.preset, evidenceClaims: receipt.evidence.claimsChecked, output: outputPath }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
