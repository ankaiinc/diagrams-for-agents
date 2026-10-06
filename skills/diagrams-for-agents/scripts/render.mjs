#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PRESETS, cells, countLimit, fitMessage, headerMetrics, headerTier, lengthLimit, marginOf, primaryCount, recordFit, setFitContext, tokenProblem, wrapAll } from './fit.mjs';

export const DIAGRAMS_FOR_AGENTS_LOCAL_VERSION = '0.3.4';
// Local Mode deliberately exposes a bounded, schema-validated primitive set.
// Specialist syntax and the long-tail framework catalogue stay in Verified Mode.
export const SUPPORTED_FAMILIES = [
  'swot', 'quadrant', 'comparison', 'flow', 'timeline', 'architecture',
  'cycle', 'pyramid', 'stack', 'venn', 'swimlane', 'raci', 'sipoc', 'fishbone',
  'journey-map', 'capability-map', 'strategy-map',
];


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

// Required string with a family-specific fit limit (see fit-limits.mjs). `old` is the pre-0.4 hard maximum and is
// only the fallback for a kind the limits table does not know.
function fitString(value, path, family, kind, old) {
  if (typeof value !== 'string' || !value.trim()) fail(`${path} must be a non-empty string.`);
  const text = value.trim();
  const limit = lengthLimit(family, kind, old);
  const size = cells(text);
  recordFit(family, kind, size);
  if (size > limit) fail(fitMessage(path, family, size, limit, 'characters', kind));
  const problem = tokenProblem(path, family, text);
  if (problem) fail(problem);
  return text;
}

// Optional string: absent or empty is fine, a present one must fit.
function optionalFit(value, path, family, kind, old) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') fail(`${path} must be a string.`);
  const text = value.trim();
  if (!text) return '';
  const limit = lengthLimit(family, kind, old);
  const size = cells(text);
  recordFit(family, kind, size);
  if (size > limit) fail(fitMessage(path, family, size, limit, 'characters', kind));
  const problem = tokenProblem(path, family, text);
  if (problem) fail(problem);
  return text;
}

// Free-form identifier that is never drawn (ids, link keys): a plain bound, not a fit limit.
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

// Array whose upper bound is a fit limit.
function fitArray(value, path, family, kind, min, old) {
  const max = Math.min(old, countLimit(family, kind, old));
  if (!Array.isArray(value)) fail(`${path} must contain ${min}–${max} items.`);
  recordFit(family, kind, value.length);
  if (value.length > max) fail(fitMessage(path, family, value.length, max, 'items'));
  if (value.length < min) fail(`${path} must contain ${min}–${max} items.`);
  return value;
}

function normalizeEvidence(value) {
  return String(value).toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function claim(item, path, source, evidenceRequired, family, kind = 'item.label') {
  if (!isPlainObject(item)) fail(`${path} must be an object.`);
  const label = fitString(item.label, `${path}.label`, family, kind, 120);
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

function validateBrand(value, family) {
  if (value === undefined) return { name: '', guidance: '', theme: DEFAULT_THEME, style: { tone: 'editorial', density: 'relaxed', corner: 'soft' } };
  if (!isPlainObject(value)) fail('brand must be an object.');
  const name = optionalFit(value.name, 'brand.name', family, 'brand.name', 80);
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

function validateBrief(value, family) {
  if (value === undefined) return { decision: '', audience: '', owner: '', asOf: '' };
  if (!isPlainObject(value)) fail('brief must be an object.');
  const string = (key, max) => optionalFit(value[key], `brief.${key}`, family, `brief.${key}`, max);
  return { decision: string('decision', 140), audience: string('audience', 80), owner: string('owner', 80), asOf: string('asOf', 40) };
}

function validateGraph(data, family) {
  const nodes = fitArray(data.nodes, 'data.nodes', family, 'nodes', 2, 9).map((node, index) => {
    if (!isPlainObject(node)) fail(`data.nodes[${index}] must be an object.`);
    return {
      ...node,
      id: nonEmptyString(node.id, `data.nodes[${index}].id`, 40),
      label: fitString(node.label, `data.nodes[${index}].label`, family, 'node.label', 80),
      detail: optionalFit(node.detail, `data.nodes[${index}].detail`, family, 'node.detail', 140),
      focal: Boolean(node.focal),
    };
  });
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) fail('data.nodes IDs must be unique.');
  const edges = fitArray(data.edges ?? [], 'data.edges', family, 'edges', family === 'flow' ? 1 : 0, 12).map((edge, index) => {
    if (!isPlainObject(edge)) fail(`data.edges[${index}] must be an object.`);
    const from = nonEmptyString(edge.from, `data.edges[${index}].from`, 40);
    const to = nonEmptyString(edge.to, `data.edges[${index}].to`, 40);
    if (!ids.has(from) || !ids.has(to)) fail(`data.edges[${index}] references an unknown node.`);
    if (from === to) fail(`data.edges[${index}] cannot connect a node to itself.`);
    return { from, to, label: optionalFit(edge.label, `data.edges[${index}].label`, family, 'edge.label', 60) };
  });
  return { nodes, edges };
}

function validateItems(value, name, source, family, countKind, labelKind, min = 1, max = 8) {
  return fitArray(value, name, family, countKind, min, max).map((item, index) => {
    const checked = claim(item, `${name}[${index}]`, source, false, family, labelKind);
    if (family === 'cycle') checked.description = optionalFit(item.description, `${name}[${index}].description`, family, 'level.description', 200);
    return checked;
  });
}

function validateLocalPrimitive(data, family, source) {
  if (['cycle', 'pyramid', 'stack'].includes(family)) {
    return { levels: validateItems(data.levels ?? data.stages, 'data.levels', source, family, 'levels', 'level.label', 2, 8) };
  }
  if (family === 'venn') {
    return {
      sets: validateItems(data.sets, 'data.sets', source, family, 'sets', 'set.label', 2, 3),
      overlapLabel: optionalFit(data.overlapLabel, 'data.overlapLabel', family, 'overlap.label', 80),
    };
  }
  if (family === 'sipoc') {
    const result = {};
    for (const key of ['suppliers', 'inputs', 'processSteps', 'outputs', 'customers']) {
      result[key] = validateItems(data[key], `data.${key}`, source, family, 'items', 'item.label', 1, 5);
    }
    return result;
  }
  if (family === 'raci') {
    const roles = fitArray(data.roles, 'data.roles', family, 'roles', 2, 6).map((role, index) => ({
      id: nonEmptyString(role?.id, `data.roles[${index}].id`, 40),
      label: fitString(role?.label, `data.roles[${index}].label`, family, 'role.label', 60),
    }));
    const activities = fitArray(data.activities, 'data.activities', family, 'activities', 2, 7).map((activity, index) => ({
      id: nonEmptyString(activity?.id, `data.activities[${index}].id`, 40),
      label: fitString(activity?.label, `data.activities[${index}].label`, family, 'activity.label', 80),
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
    const lanes = fitArray(data.lanes, 'data.lanes', family, 'lanes', 2, 5).map((lane, index) => ({
      label: fitString(lane?.label, `data.lanes[${index}].label`, family, 'lane.label', 60),
      steps: fitArray(lane?.steps, `data.lanes[${index}].steps`, family, 'steps', 1, 6).map((step, stepIndex) => fitString(step, `data.lanes[${index}].steps[${stepIndex}]`, family, 'step.label', 80)),
    }));
    return { lanes };
  }
  if (family === 'fishbone') {
    return {
      effect: fitString(data.effect, 'data.effect', family, 'effect', 100),
      categories: fitArray(data.categories, 'data.categories', family, 'categories', 2, 6).map((category, index) => ({
        label: fitString(category?.label, `data.categories[${index}].label`, family, 'category.label', 60),
        causes: validateItems(category?.causes, `data.categories[${index}].causes`, source, family, 'causes', 'cause.label', 1, 4),
      })),
    };
  }
  if (family === 'journey-map') {
    return {
      persona: optionalFit(data.persona, 'data.persona', family, 'persona', 80),
      stages: fitArray(data.stages, 'data.stages', family, 'stages', 2, 6).map((stage, index) => ({
        label: fitString(stage?.label, `data.stages[${index}].label`, family, 'stage.label', 60),
        action: fitString(stage?.action, `data.stages[${index}].action`, family, 'stage.action', 100),
        pain: optionalFit(stage?.pain, `data.stages[${index}].pain`, family, 'stage.pain', 100),
        opportunity: optionalFit(stage?.opportunity, `data.stages[${index}].opportunity`, family, 'stage.opportunity', 100),
      })),
    };
  }
  if (family === 'capability-map') {
    return {
      levels: validateItems(data.levels, 'data.levels', source, family, 'levels', 'level.label', 2, 4),
      domains: fitArray(data.domains, 'data.domains', family, 'domains', 2, 6).map((domain, index) => ({
        label: fitString(domain?.label, `data.domains[${index}].label`, family, 'domain.label', 60),
        capabilities: validateItems(domain?.capabilities, `data.domains[${index}].capabilities`, source, family, 'capabilities', 'capability.label', 1, 6),
      })),
    };
  }
  if (family === 'strategy-map') {
    const result = {};
    for (const key of ['financial', 'customer', 'internalProcess', 'learningGrowth']) {
      result[key] = validateItems(data[key], `data.${key}`, source, family, 'items', 'item.label', 1, 5);
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
  setFitContext(preset, primaryCount(family, raw.data), headerTier(preset, typeof raw.title === 'string' ? raw.title.trim() : '', typeof raw.subtitle === 'string' ? raw.subtitle.trim() : ''));
  const title = fitString(raw.title, 'title', family, 'title', 120);
  const subtitle = optionalFit(raw.subtitle, 'subtitle', family, 'subtitle', 220);
  const source = typeof raw.source === 'string' ? raw.source.trim() : '';
  const brand = validateBrand(raw.brand, family);
  const brief = validateBrief(raw.brief, family);
  const theme = safeTheme(raw.theme, brand.theme);
  const data = isPlainObject(raw.data) ? raw.data : fail('data must be an object.');
  const evidenceRequired = REQUIRED_EVIDENCE.has(family);
  let validatedData;

  if (family === 'swot') {
    validatedData = {};
    for (const section of ['strengths', 'weaknesses', 'opportunities', 'threats']) {
      validatedData[section] = fitArray(data[section], `data.${section}`, family, 'items', 1, 4)
        .map((item, index) => claim(item, `data.${section}[${index}]`, source, evidenceRequired, family));
    }
  } else if (family === 'quadrant') {
    if (!isPlainObject(data.axes)) fail('data.axes must be an object.');
    const axes = {};
    for (const key of ['xLow', 'xHigh', 'yLow', 'yHigh']) axes[key] = fitString(data.axes[key], `data.axes.${key}`, family, 'axis.label', 50);
    const points = fitArray(data.points, 'data.points', family, 'points', 2, 8).map((item, index) => {
      const checked = claim(item, `data.points[${index}]`, source, evidenceRequired, family, 'point.label');
      const x = Number(item.x);
      const y = Number(item.y);
      if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
        fail(`data.points[${index}] x and y must be between 0 and 1.`);
      }
      return { ...checked, x, y, focal: Boolean(item.focal) };
    });
    validatedData = { axes, points };
  } else if (family === 'comparison') {
    const columns = fitArray(data.columns, 'data.columns', family, 'columns', 2, 4).map((column, columnIndex) => {
      if (!isPlainObject(column)) fail(`data.columns[${columnIndex}] must be an object.`);
      return {
        title: fitString(column.title, `data.columns[${columnIndex}].title`, family, 'column.title', 60),
        focal: Boolean(column.focal),
        items: fitArray(column.items, `data.columns[${columnIndex}].items`, family, 'items', 1, 5)
          .map((item, itemIndex) => claim(item, `data.columns[${columnIndex}].items[${itemIndex}]`, source, evidenceRequired, family)),
      };
    });
    validatedData = { columns };
  } else if (family === 'timeline') {
    const items = fitArray(data.items, 'data.items', family, 'items', 2, 8).map((item, index) => {
      if (!isPlainObject(item)) fail(`data.items[${index}] must be an object.`);
      return {
        date: fitString(item.date, `data.items[${index}].date`, family, 'item.date', 40),
        label: fitString(item.label, `data.items[${index}].label`, family, 'item.label', 90),
        detail: optionalFit(item.detail, `data.items[${index}].detail`, family, 'item.detail', 160),
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

// Average glyph advance as a fraction of the font size. Arial is ~0.5, Verdana ~0.58; 0.6 keeps wide brand fonts safe.
const CW = 0.6;
const MONO_CW = 0.74; // uppercase monospace with .1em tracking
const ceil1 = (value) => Math.round(value * 10) / 10;

// Greedy word wrap measured in visual cells (CJK counts double). A word longer than a line is broken at the line
// width, so one unbroken token wraps instead of running off its card. Text that still does not fit is an error:
// the layouts never clip with an ellipsis.
function wrap(text, maxChars = 28, maxLines = 3) {
  const lines = wrapAll(text, maxChars);
  if (lines.length > maxLines) {
    fail(`"${String(text).trim().slice(0, 40)}${String(text).trim().length > 40 ? '…' : ''}" does not fit the space this layout gives it (${maxLines} lines of ${maxChars} characters). Shorten it or split the diagram.`);
  }
  return lines;
}

/**
 * Shrink-to-fit text: the largest size between `size` and `min` at which the wrapped text fits a w x h box.
 * Throws (fail-closed) when even the minimum size does not fit.
 */
function fitLayout(text, { w, h, size = 16, min = 10, leading = 1.22, cw = CW, maxLines = Infinity }) {
  const body = String(text).trim();
  let s = size;
  for (;;) {
    const lines = wrapAll(body, Math.max(1, Math.floor(w / (s * cw))));
    if (lines.length <= maxLines && lines.length * s * leading <= h + 0.01) return { lines, size: s, leading, used: lines.length * s * leading };
    if (s <= min) {
      fail(`"${body.slice(0, 40)}${body.length > 40 ? '…' : ''}" does not fit the ${Math.round(w)}x${Math.round(h)}px box this layout gives it, even at ${min}px type. Shorten it or split the diagram.`);
    }
    s = Math.max(min, s - 1);
  }
}

function fitText(text, px, top, options) {
  const { h, weight = 500, fill = 'var(--ink)', anchor = 'start', cls = '', valign = 'top' } = options;
  const layout = fitLayout(text, options);
  const t0 = top + (valign === 'middle' ? (h - layout.used) / 2 : valign === 'bottom' ? h - layout.used : 0);
  const first = ceil1(t0 + layout.size * 0.95);
  const step = ceil1(layout.size * layout.leading);
  return `<text x="${ceil1(px)}" y="${first}" text-anchor="${anchor}" style="font-size:${layout.size}px" font-weight="${weight}" fill="${fill}"${cls ? ` class="${cls}"` : ''}>${layout.lines.map((line, index) => `<tspan x="${ceil1(px)}" dy="${index === 0 ? 0 : step}">${x(line)}</tspan>`).join('')}</text>`;
}

function textLines(text, px, py, { size = 18, weight = 500, fill = 'var(--ink)', max = 30, lines = 3, anchor = 'start', leading = 1.25, cls = '' } = {}) {
  return `<text x="${px}" y="${py}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}" class="${cls}">${wrap(text, max, lines).map((line, index) => `<tspan x="${px}" dy="${index === 0 ? 0 : size * leading}">${x(line)}</tspan>`).join('')}</text>`;
}

function headerLayout(spec) {
  const m = headerMetrics(spec.preset, spec.title, spec.subtitle);
  const titleLines = wrap(spec.title, m.titleMax, 3);
  const subtitleLines = spec.subtitle ? wrap(spec.subtitle, m.subtitleMax, 2) : [];
  return { ...m, titleLines, subtitleLines };
}

function baseParts(spec) {
  const { width, height } = PRESETS[spec.preset];
  const margin = marginOf(spec.preset);
  const heading = headerLayout(spec);
  const header = heading.contentTop;
  const footer = 58;
  const radius = spec.brand.style.corner === 'sharp' ? 2 : spec.brand.style.corner === 'round' ? 16 : 8;
  const density = spec.brand.style.density === 'compact' ? 0.88 : 1;
  return { width, height, margin, header, footer, radius, density, contentW: width - margin * 2, contentH: height - header - footer, heading };
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
    const slot = (cardH - 70 - 14) / items.length;
    return `<g>
      <rect x="${px}" y="${py}" width="${cardW}" height="${cardH}" rx="8" fill="${focal ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${focal ? 'var(--accent)' : 'var(--rule)'}"/>
      <text x="${px + 24}" y="${py + 34}" class="eyebrow">${number}</text>
      <text x="${px + 64}" y="${py + 36}" font-size="19" font-weight="700">${label}</text>
      <line x1="${px + 24}" y1="${py + 54}" x2="${px + cardW - 24}" y2="${py + 54}" stroke="var(--rule)"/>
      ${items.map((item, itemIndex) => {
        const top = py + 68 + itemIndex * slot;
        return `<circle cx="${px + 31}" cy="${top + 9}" r="4" fill="${focal ? 'var(--accent)' : 'var(--ink)'}"/>${fitText(item.label, px + 48, top, { w: cardW - 48 - 24, h: slot - 6, size: 16, min: 11 })}`;
      }).join('')}
    </g>`;
  }).join('');
}

function quadrantSvg(spec, box) {
  const gutter = 124;
  const left = box.margin + gutter;
  const top = box.header + 26;
  const w = box.contentW - gutter - 40;
  const h = box.contentH - 76;
  const { axes, points } = spec.data;
  const axis = { size: 11, min: 9, cls: 'axis', cw: MONO_CW };
  const labelW = Math.max(100, Math.min(230, w * 0.2));
  return `<g>
    <rect x="${left}" y="${top}" width="${w}" height="${h}" fill="var(--paper-2)" stroke="var(--rule)"/>
    <line x1="${left + w / 2}" y1="${top}" x2="${left + w / 2}" y2="${top + h}" stroke="var(--rule)" stroke-dasharray="5 7"/>
    <line x1="${left}" y1="${top + h / 2}" x2="${left + w}" y2="${top + h / 2}" stroke="var(--rule)" stroke-dasharray="5 7"/>
    ${fitText(axes.xLow, left, top + h + 12, { ...axis, w: w / 2 - 16, h: 38 })}
    ${fitText(axes.xHigh, left + w, top + h + 12, { ...axis, w: w / 2 - 16, h: 38, anchor: 'end' })}
    ${fitText(axes.yHigh, left - 14, top, { ...axis, w: gutter - 28, h: 92, anchor: 'end' })}
    ${fitText(axes.yLow, left - 14, top + h - 92, { ...axis, w: gutter - 28, h: 92, anchor: 'end', valign: 'bottom' })}
    ${points.map((point) => {
      const px = left + point.x * w;
      const py = top + (1 - point.y) * h;
      const right = left + w - (px + 16) >= 100;
      const room = right ? left + w - (px + 16) : px - 16 - left;
      const lw = Math.max(60, Math.min(labelW, room));
      const bh = Math.min(60, h / 2 - 8);
      const by = Math.max(top + 4, Math.min(top + h - bh - 4, py - bh / 2));
      return `<g><circle cx="${px}" cy="${py}" r="${point.focal ? 11 : 8}" fill="${point.focal ? 'var(--accent)' : 'var(--ink)'}" stroke="var(--paper)" stroke-width="3"/>${fitText(point.label, right ? px + 16 : px - 16, by, { w: lw, h: bh, size: 14, weight: 650, min: 10, anchor: right ? 'start' : 'end', valign: 'middle' })}</g>`;
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
    const rowH = (cardH - 92) / column.items.length;
    return `<g>
      <rect x="${px}" y="${py}" width="${cardW}" height="${cardH}" rx="8" fill="${column.focal ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${column.focal ? 'var(--accent)' : 'var(--rule)'}"/>
      ${fitText(column.title, px + 24, py + 14, { w: cardW - 48, h: 46, size: 19, weight: 720, min: 12, valign: 'middle' })}
      <line x1="${px + 22}" y1="${py + 68}" x2="${px + cardW - 22}" y2="${py + 68}" stroke="var(--rule)"/>
      ${column.items.map((item, itemIndex) => {
        const top = py + 82 + itemIndex * rowH;
        return `<path d="M ${px + 25} ${top + 9} l 4 4 l 8 -9" fill="none" stroke="${column.focal ? 'var(--accent)' : 'var(--muted)'}" stroke-width="2"/>${fitText(item.label, px + 48, top, { w: cardW - 48 - 22, h: rowH - 8, size: 15, min: 11 })}`;
      }).join('')}
    </g>`;
  }).join('');
}

// ---- flow / architecture: grid placement + channel routing ------------------------------------------------------
// Nodes sit on a grid in authored order. Every edge is routed on its own track through the channels between rows
// (or straight across a gap for adjacent neighbours), so no connector crosses a card, shares a stroke with another
// connector, or lands on the wrong side of its target. Labels are never truncated: they wrap and sit on a mask.
const TRACK_GAP = 12;
const LABEL_TRACK_GAP = 20;
const LABEL_CHAR_W = 7.8;
const clampNum = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

function labelLines(label, maxChars, maxLines) {
  const lines = wrap(label.toUpperCase(), maxChars, maxLines + 2);
  return lines.length > maxLines ? [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')] : lines;
}

function graphModel(spec, box, architecture = false) {
  const nodes = spec.data.nodes;
  const edges = spec.data.edges;
  // Columns: the authored default, capped so a card never gets narrower than ~190px on a narrow canvas.
  const wanted = architecture ? Math.min(3, nodes.length) : nodes.length <= 4 ? nodes.length : nodes.length <= 8 ? 4 : 5;
  const maxCols = Math.max(2, Math.min(wanted, Math.floor((box.contentW + 92) / (190 + 92)), nodes.length));
  // The same number of rows with the fewest columns gives wider cards for free (5 or 6 nodes: 3 columns, not 4).
  const cols = Math.max(2, Math.ceil(nodes.length / Math.ceil(nodes.length / maxCols)));
  const rows = Math.ceil(nodes.length / cols);
  const grid = new Map(nodes.map((node, index) => [node.id, { index, col: index % cols, row: Math.floor(index / cols) }]));
  const kind = edges.map((edge) => {
    const a = grid.get(edge.from);
    const b = grid.get(edge.to);
    if (a.row === b.row && b.col === a.col + 1) return 'straight';
    if (a.col === b.col && Math.abs(a.row - b.row) === 1) return 'vertical';
    return 'channel';
  });
  // Gap between neighbours grows with the longest label that must sit between them.
  const straightLabels = edges.filter((_, k) => kind[k] === 'straight' && edges[k].label).map((edge) => edge.label);
  const straightLabel = Math.max(0, ...straightLabels.map((label) => cells(label)));
  const longestWord = Math.max(0, ...straightLabels.flatMap((label) => label.split(/\s+/).map((word) => cells(word))));
  // With few columns there is room to widen the gaps, which is where edge labels and through-connectors live.
  const baseGapX = clampNum(Math.floor((box.contentW - cols * 240) / Math.max(1, cols - 1)), architecture ? 96 : 92, 150);
  const gapX = straightLabel ? clampNum(Math.max(28 + Math.ceil(straightLabel / 2) * LABEL_CHAR_W, 18 + longestWord * LABEL_CHAR_W, 44 + longestWord * LABEL_CHAR_W), baseGapX, 150) : baseGapX;
  const nodeW = (box.contentW - gapX * (cols - 1)) / cols;

  // Card text shrinks (to 75%) rather than overflowing; k is chosen once so every card uses the same scale.
  const cardText = (node, k) => {
    const ts = 16 * k;
    const ds = 12 * k;
    const title = wrapAll(node.label, Math.max(4, Math.floor((nodeW - 36) / (ts * CW))));
    const detail = node.detail ? wrapAll(node.detail, Math.max(4, Math.floor((nodeW - 36) / (ds * CW)))) : [];
    const height = 34 + title.length * ts * 1.2 + (detail.length ? 6 + detail.length * ds * 1.25 : 0) + 12;
    return { title, detail, ts, ds, height };
  };
  const needed = Math.max(...nodes.map((node) => cardText(node, 1).height));

  // Channel k is the strip below row k (the last one is the bottom margin). Plan each edge's legs first.
  const legs = [];
  const plan = edges.map((edge, k) => {
    const a = grid.get(edge.from);
    const b = grid.get(edge.to);
    if (kind[k] !== 'channel') return { kind: kind[k], a, b };
    const down = b.row > a.row;
    const up = b.row < a.row;
    const exit = up ? 'top' : 'bottom';
    const enter = down ? 'top' : 'bottom';
    const first = up ? a.row - 1 : a.row;
    const last = down ? b.row - 1 : up ? b.row : a.row;
    const route = { kind: 'channel', a, b, exit, enter, first, last, k };
    legs.push({ k, channel: first, which: 'first' });
    if (last !== first) legs.push({ k, channel: last, which: 'last' });
    return route;
  });
  const labeled = new Set(edges.map((edge, k) => (edge.label ? k : -1)));
  const slotsByChannel = Array.from({ length: rows }, () => []);
  const colX = (col) => box.margin + col * (nodeW + gapX);
  legs.forEach((leg) => {
    const r = plan[leg.k];
    const ax = colX(r.a.col) + nodeW / 2;
    const bx = colX(r.b.col) + nodeW / 2;
    const multi = r.first !== r.last;
    const gx = multi ? colX(r.b.col) - gapX + 20 : null;
    const [lo, hi] = leg.which === 'first' && multi ? [Math.min(ax, gx), Math.max(ax, gx)] : leg.which === 'last' && multi ? [Math.min(gx, bx), Math.max(gx, bx)] : [Math.min(ax, bx), Math.max(ax, bx)];
    leg.lo = lo - 18;
    leg.hi = hi + 18;
    leg.labeled = labeled.has(leg.k) && ((!multi && true) || leg.which === 'first');
  });
  legs.sort((p, q) => p.lo - q.lo || p.k - q.k);
  legs.forEach((leg) => {
    const slots = slotsByChannel[leg.channel];
    let slot = slots.findIndex((taken) => taken.every((other) => other.hi < leg.lo || other.lo > leg.hi));
    if (slot < 0) { slots.push([]); slot = slots.length - 1; }
    slots[slot].push(leg);
    leg.slot = slot;
  });
  const channelGap = slotsByChannel.map((slots) => {
    const tallest = Math.max(0, ...slots.flatMap((slot) => slot.filter((leg) => leg.labeled).map((leg) => labelLines(edges[leg.k].label, 34, 2).length * 13 + 6)));
    const spacing = tallest ? Math.max(LABEL_TRACK_GAP, tallest + 8) : TRACK_GAP;
    return { spacing, count: slots.length, height: slots.length ? 30 + (slots.length - 1) * spacing + (tallest ? tallest : 0) : 0 };
  });
  // A labelled edge between two cards in the same column needs a free band beside it as well as the tracks.
  edges.forEach((edge, k) => {
    if (kind[k] !== 'vertical' || !edge.label) return;
    const c = Math.min(grid.get(edge.from).row, grid.get(edge.to).row);
    channelGap[c].height += labelLines(edge.label, 24, 2).length * 26 + 12;
  });
  const innerGaps = channelGap.slice(0, rows - 1).map((c) => Math.max(c.height, architecture ? 64 : 56));
  const bottomGap = channelGap[rows - 1].height;
  const free = box.contentH - 24 - innerGaps.reduce((s, g) => s + g, 0) - bottomGap;
  if (free / rows < 90) fail(`${rows} rows of cards do not fit the page height with this title, subtitle and number of connectors. Shorten the title or subtitle, or split the diagram.`);
  const nodeH = clampNum(Math.min(Math.max(needed, 124), needed > 176 ? 220 : 176), 96, Math.max(96, free / rows));
  let scale = 1;
  let text = nodes.map((node) => cardText(node, scale));
  while (text.some((t) => t.height > nodeH) && scale > 0.75) {
    scale = Math.max(0.75, scale - 0.05);
    text = nodes.map((node) => cardText(node, scale));
  }
  text.forEach((t, index) => {
    if (t.height > nodeH) fail(`data.nodes[${index}] (${nodes[index].label.slice(0, 30)}) does not fit its card, even at reduced type. Shorten the label or detail, or split the diagram.`);
  });
  const spare = Math.max(0, free - nodeH * rows);
  const rowY = [];
  let cursor = box.header + 18 + Math.min(36, spare / 3);
  for (let r = 0; r < rows; r += 1) { rowY.push(cursor); cursor += nodeH + (innerGaps[r] ?? 0); }
  const channelTop = (c) => rowY[c] + nodeH;
  const channelSize = (c) => (c < rows - 1 ? innerGaps[c] : Math.max(bottomGap, 36));
  const trackY = (leg) => {
    const c = channelGap[leg.channel];
    const size = channelSize(leg.channel);
    return channelTop(leg.channel) + (size - (c.count - 1) * c.spacing) / 2 + leg.slot * c.spacing;
  };

  const positions = new Map();
  nodes.forEach((node, index) => {
    const g = grid.get(node.id);
    positions.set(node.id, { ...node, x: colX(g.col), y: rowY[g.row], w: nodeW, h: nodeH, col: g.col, row: g.row, text: text[index] });
  });

  // Preferred attach points fan along each card side; each connector then takes the nearest free x so parallel
  // vertical strokes stay at least 10px apart (two cards in one column otherwise stack their connectors).
  const sides = new Map();
  const addSide = (id, side, k, role, otherX) => {
    const key = `${id}:${side}`;
    if (!sides.has(key)) sides.set(key, []);
    sides.get(key).push({ k, role, otherX });
  };
  plan.forEach((r, k) => {
    const A = edges[k].from;
    const B = edges[k].to;
    const ax0 = positions.get(A).x;
    const bx0 = positions.get(B).x;
    if (r.kind === 'vertical') {
      const down = positions.get(B).row > positions.get(A).row;
      addSide(A, down ? 'bottom' : 'top', k, 'out', bx0);
      addSide(B, down ? 'top' : 'bottom', k, 'in', ax0);
    } else if (r.kind === 'channel') {
      addSide(A, r.exit, k, 'out', bx0);
      addSide(B, r.enter, k, 'in', ax0);
    }
  });
  const preferred = new Map();
  for (const [key, list] of sides) {
    const node = positions.get(key.split(':')[0]);
    list.sort((p, q) => p.otherX - q.otherX || p.k - q.k).forEach((entry, i) => preferred.set(`${key}:${entry.k}:${entry.role}`, node.x + (node.w * (i + 1)) / (list.length + 1)));
  }
  const verticals = [];
  const clash = (px, y0, y1) => verticals.some((v) => Math.abs(v.x - px) < 16 && Math.min(y0, y1) < Math.max(v.y0, v.y1) - 1 && Math.max(y0, y1) > Math.min(v.y0, v.y1) + 1);
  const pickX = (id, side, k, role, y0, y1) => {
    const node = positions.get(id);
    const want = preferred.get(`${id}:${side}:${k}:${role}`);
    for (let step = 0; step < 16; step += 1) {
      for (const dir of step === 0 ? [0] : [1, -1]) {
        const px = want + dir * step * 9;
        if (px > node.x + 14 && px < node.x + node.w - 14 && !clash(px, y0, y1)) { verticals.push({ x: px, y0, y1 }); return px; }
      }
    }
    verticals.push({ x: want, y0, y1 });
    return want;
  };

  const routes = [];
  edges.forEach((edge, k) => {
    const r = plan[k];
    const A = positions.get(edge.from);
    const B = positions.get(edge.to);
    let pts;
    let anchor;
    if (r.kind === 'straight') {
      const y = A.y + A.h / 2;
      pts = [[A.x + A.w, y], [B.x, y]];
      anchor = { type: 'gap', lo: A.x + A.w, hi: B.x, y };
    } else if (r.kind === 'vertical') {
      const down = B.row > A.row;
      const y1 = down ? A.y + A.h : A.y;
      const y2 = down ? B.y : B.y + B.h;
      const mid = (y1 + y2) / 2;
      const x1 = pickX(edge.from, down ? 'bottom' : 'top', k, 'out', y1, mid);
      const x2 = pickX(edge.to, down ? 'top' : 'bottom', k, 'in', mid, y2);
      pts = x1 === x2 ? [[x1, y1], [x1, y2]] : [[x1, y1], [x1, mid], [x2, mid], [x2, y2]];
      anchor = { type: 'side', x: x1, y: mid, y1: Math.min(y1, y2), y2: Math.max(y1, y2) };
    } else {
      const y1 = r.exit === 'top' ? A.y : A.y + A.h;
      const y2 = r.enter === 'top' ? B.y : B.y + B.h;
      const first = legs.find((leg) => leg.k === k && leg.which === 'first');
      const ty1 = trackY(first);
      if (r.first === r.last) {
        const x1 = pickX(edge.from, r.exit, k, 'out', y1, ty1);
        const x2 = pickX(edge.to, r.enter, k, 'in', ty1, y2);
        pts = [[x1, y1], [x1, ty1], [x2, ty1], [x2, y2]];
        anchor = { type: 'track', lo: Math.min(x1, x2), hi: Math.max(x1, x2), y: ty1 };
      } else {
        const lastLeg = legs.find((leg) => leg.k === k && leg.which === 'last');
        const ty2 = trackY(lastLeg);
        const gx = colX(r.b.col) - gapX + 14 + (k % 3) * 6;
        const x1 = pickX(edge.from, r.exit, k, 'out', y1, ty1);
        const x2 = pickX(edge.to, r.enter, k, 'in', ty2, y2);
        pts = [[x1, y1], [x1, ty1], [gx, ty1], [gx, ty2], [x2, ty2], [x2, y2]];
        anchor = { type: 'track', lo: Math.min(x1, gx), hi: Math.max(x1, gx), y: ty1 };
      }
    }
    routes.push({ k, edge, kind: r.kind, pts, anchor, label: null });
  });

  // Labels last, so each one can dodge every other connector, card and label.
  const segsOf = (route) => route.pts.slice(1).map((pt, i) => [route.pts[i], pt]);
  const hits = (box0, route) => segsOf(route).some(([[x1, y1], [x2, y2]]) => Math.max(x1, x2) > box0.x - 2 && Math.min(x1, x2) < box0.x + box0.w + 2 && Math.max(y1, y2) > box0.y - 2 && Math.min(y1, y2) < box0.y + box0.h + 2);
  const hitsNode = (box0) => [...positions.values()].some((n) => box0.x < n.x + n.w && box0.x + box0.w > n.x && box0.y < n.y + n.h && box0.y + box0.h > n.y);
  const placed = [];
  const makeLabel = (label, cx, cy, maxChars, maxLines) => {
    const lines = labelLines(label, maxChars, maxLines);
    const w = Math.max(...lines.map((l) => cells(l))) * LABEL_CHAR_W + 10;
    const h = lines.length * 13 + 6;
    return { lines, cx, cy, w, h, x: cx - w / 2, y: cy - h / 2 };
  };
  routes.forEach((route) => {
    const { edge, anchor } = route;
    if (!edge.label) return;
    let candidates;
    if (anchor.type === 'gap') {
      // Leave room for a through-connector only in a gap that has one.
      const crossed = plan.some((r) => r.kind === 'channel' && r.first !== r.last && r.b.col === grid.get(edge.to).col);
      const maxChars = Math.max(6, Math.floor((gapX - (crossed ? 44 : 14)) / LABEL_CHAR_W));
      const lines = labelLines(edge.label, maxChars, 3).length;
      const gapX0 = (anchor.lo + anchor.hi) / 2;
      const at = (cx0, cy0) => makeLabel(edge.label, cx0, cy0, maxChars, 3);
      const wide = at(gapX0, 0).w;
      const flushRight = anchor.hi - 4 - wide / 2;
      candidates = [0, 1, 2].flatMap((tier) => {
        const up = anchor.y - 10 - (lines * 13) / 2 - tier * (lines * 13 + 14);
        const down = anchor.y + 12 + (lines * 13) / 2 + tier * (lines * 13 + 14);
        return [at(gapX0, up), at(gapX0, down), at(flushRight, up), at(flushRight, down)];
      });
    } else if (anchor.type === 'side') {
      const first = makeLabel(edge.label, anchor.x + 10, anchor.y, 24, 2);
      const span = (anchor.y2 - anchor.y1) / 2 - first.h / 2 - 2;
      const shifts = [0];
      for (let d = 6; d <= span; d += 6) shifts.push(-d, d);
      candidates = shifts.flatMap((dy) => [
        { ...first, cx: anchor.x + 10 + first.w / 2, x: anchor.x + 10, cy: anchor.y + dy, y: anchor.y + dy - first.h / 2 },
        { ...first, cx: anchor.x - 10 - first.w / 2, x: anchor.x - 10 - first.w, cy: anchor.y + dy, y: anchor.y + dy - first.h / 2 },
      ]);
    } else {
      const base = makeLabel(edge.label, 0, anchor.y, 34, 2);
      const room = anchor.hi - anchor.lo - base.w - 16;
      const fractions = room > 0 ? [0.5, 0.3, 0.7, 0.15, 0.85, 0, 1] : [0.5];
      candidates = fractions.map((f) => ({ ...base, cx: anchor.lo + 8 + base.w / 2 + Math.max(0, room) * f, x: anchor.lo + 8 + Math.max(0, room) * f }));
    }
    const free = (c) => !hitsNode(c) && !placed.some((o) => c.x < o.x + o.w && c.x + c.w > o.x && c.y < o.y + o.h && c.y + c.h > o.y) && !routes.some((o) => o !== route && hits(c, o));
    const onCanvas = (c) => c.x >= 6 && c.x + c.w <= box.width - 6;
    const ok = candidates.find((c) => onCanvas(c) && free(c)) || candidates.find((c) => onCanvas(c) && !hitsNode(c)) || candidates.find(free);
    route.label = ok || candidates.find(onCanvas) || candidates[0];
    placed.push(route.label);
  });
  return { positions, routes, nodeW, nodeH, gapX, cols, rows };
}

function pathOf(pts) {
  return pts.map(([px, py], i) => (i === 0 ? `M ${px} ${py}` : px === pts[i - 1][0] ? `V ${py}` : `H ${px}`)).join(' ');
}

/** Test seam: the computed geometry (cards, routed polylines, label boxes) of a flow or architecture spec. */
export function graphGeometry(specInput) {
  const spec = validateSpec(specInput);
  return graphModel(spec, baseParts(spec), spec.family === 'architecture');
}

function graphSvg(spec, box, architecture = false) {
  const { positions, routes } = graphModel(spec, box, architecture);
  const edges = routes.map((route) => {
    const label = route.label
      ? `<rect x="${route.label.x.toFixed(1)}" y="${route.label.y.toFixed(1)}" width="${route.label.w.toFixed(1)}" height="${route.label.h.toFixed(1)}" rx="3" fill="var(--paper)"/><text x="${route.label.cx.toFixed(1)}" y="${(route.label.y + 15).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="650" class="edge-label">${route.label.lines.map((line, i) => `<tspan x="${route.label.cx.toFixed(1)}" dy="${i === 0 ? 0 : 13}">${x(line)}</tspan>`).join('')}</text>`
      : '';
    return `<g><path d="${pathOf(route.pts)}" fill="none" stroke="var(--muted)" stroke-width="2" marker-end="url(#arrow)"/>${label}</g>`;
  }).join('');
  const nodes = [...positions.values()].map((node, index) => `<g>
    <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8" fill="var(--paper)"/>
    <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8" fill="${node.focal ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${node.focal ? 'var(--accent)' : 'var(--rule-strong)'}"/>
    <text x="${node.x + 18}" y="${node.y + 21}" class="eyebrow">${String(index + 1).padStart(2, '0')}</text>
    <text x="${node.x + 18}" y="${ceil1(node.y + 32 + node.text.ts * 0.95)}" text-anchor="start" style="font-size:${ceil1(node.text.ts)}px" font-weight="720" fill="var(--ink)">${node.text.title.map((line, i) => `<tspan x="${node.x + 18}" dy="${i === 0 ? 0 : ceil1(node.text.ts * 1.2)}">${x(line)}</tspan>`).join('')}</text>
    ${node.text.detail.length ? `<text x="${node.x + 18}" y="${ceil1(node.y + 32 + node.text.title.length * node.text.ts * 1.2 + 6 + node.text.ds * 0.95)}" text-anchor="start" style="font-size:${ceil1(node.text.ds)}px" font-weight="450" fill="var(--muted)">${node.text.detail.map((line, i) => `<tspan x="${node.x + 18}" dy="${i === 0 ? 0 : ceil1(node.text.ds * 1.25)}">${x(line)}</tspan>`).join('')}</text>` : ''}
  </g>`).join('');
  return edges + nodes;
}

function timelineSvg(spec, box) {
  const items = spec.data.items;
  const left = box.margin + 52;
  const right = box.width - box.margin - 52;
  const y = box.header + box.contentH * 0.5;
  const step = (right - left) / (items.length - 1);
  // Same-side neighbours sit two steps apart; the end blocks are pulled inside the margins, which eats into that.
  const blockW = Math.max(90, Math.min(250, ((2 * step + 52) * 2) / 3 - 6));
  const avail = box.contentH * 0.5 - 34 - 10;
  const labelH = Math.min(66, avail * 0.4);
  const detailH = Math.min(76, avail * 0.45);
  const date = { size: 11, min: 9, cls: 'eyebrow', cw: MONO_CW, h: 28 };
  return `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="var(--rule-strong)" stroke-width="2"/>${items.map((item, index) => {
    const px = left + index * step;
    const above = index % 2 === 0;
    const focal = item.focal;
    const cx = Math.max(box.margin + blockW / 2, Math.min(box.width - box.margin - blockW / 2, px));
    const dateL = fitLayout(item.date, { ...date, w: blockW });
    const labelL = fitLayout(item.label, { w: blockW, h: labelH, size: 16, min: 11 });
    const detailL = item.detail ? fitLayout(item.detail, { w: blockW, h: detailH, size: 12, min: 9.5 }) : null;
    const height = dateL.used + 4 + labelL.used + (detailL ? 6 + detailL.used : 0);
    const top = above ? y - 34 - height : y + 34;
    const labelTop = top + dateL.used + 4;
    return `<g>
      <line x1="${px}" y1="${y}" x2="${px}" y2="${above ? y - 28 : y + 28}" stroke="${focal ? 'var(--accent)' : 'var(--rule-strong)'}"/>
      <circle cx="${px}" cy="${y}" r="${focal ? 10 : 7}" fill="${focal ? 'var(--accent)' : 'var(--ink)'}" stroke="var(--paper)" stroke-width="3"/>
      ${fitText(item.date, cx, top, { ...date, w: blockW, anchor: 'middle' })}
      ${fitText(item.label, cx, labelTop, { w: blockW, h: labelL.used, size: 16, weight: 680, min: 11, anchor: 'middle' })}
      ${detailL ? fitText(item.detail, cx, labelTop + labelL.used + 6, { w: blockW, h: detailL.used, size: 12, fill: 'var(--muted)', min: 9.5, anchor: 'middle' }) : ''}
    </g>`;
  }).join('')}`;
}

function card(x0, y0, width, height, label, detail = '', focal = false, index = '') {
  const pad = 16;
  const top = y0 + (index ? 30 : 12);
  const avail = y0 + height - 10 - top;
  const labelH = detail ? avail * 0.58 : avail;
  const labelL = fitLayout(label, { w: width - pad * 2, h: labelH, size: 16, min: 10 });
  const body = fitText(label, x0 + pad, top, { w: width - pad * 2, h: labelH, size: 16, weight: 720, min: 10, valign: detail ? 'top' : 'middle' });
  const detailTop = top + labelL.used + 6;
  return `<g><rect x="${x0}" y="${y0}" width="${width}" height="${height}" rx="8" fill="${focal ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${focal ? 'var(--accent)' : 'var(--rule-strong)'}"/>
    ${index ? `<text x="${x0 + 16}" y="${y0 + 22}" class="eyebrow">${x(index)}</text>` : ''}
    ${body}
    ${detail ? fitText(detail, x0 + pad, detailTop, { w: width - pad * 2, h: y0 + height - 10 - detailTop, size: 12, fill: 'var(--muted)', min: 9 }) : ''}</g>`;
}

function cycleSvg(spec, box) {
  const items = spec.data.levels;
  const cx = box.width / 2;
  const cy = box.header + box.contentH / 2;
  const cardW = Math.min(items.length > 6 ? 200 : 276, box.contentW / (items.length > 6 ? 4.4 : 3.9));
  // Cards on neighbouring angles must clear each other vertically; more cards means shorter cards.
  const cardH = Math.max(80, Math.min(box.contentH > 700 ? 190 : 150, (box.contentH - 16) / (items.length >= 7 ? 3.9 : 3.1)));
  const rx = (box.contentW - cardW) / 2 - 8;
  const ry = (box.contentH - cardH) / 2 - 8;
  const arx = rx - cardW / 2 - 14;
  const ary = ry - cardH / 2 - 14;
  const hub = Math.max(40, Math.min(arx, ary) * 0.78);
  const turn = (Math.PI * 2) / items.length;
  const at = (angle, ax, ay) => [cx + Math.cos(angle) * ax, cy + Math.sin(angle) * ay];
  return `<circle cx="${cx}" cy="${cy}" r="${hub}" fill="var(--accent-soft)" stroke="var(--accent)"/><text x="${cx}" y="${cy - 5}" text-anchor="middle" class="eyebrow">REINFORCING</text>${textLines('Loop', cx, cy + 24, { size: 22, weight: 760, anchor: 'middle', max: 12, lines: 1 })}
  ${items.map((item, index) => {
    const angle = -Math.PI / 2 + turn * index;
    const [mx, my] = at(angle, rx, ry);
    const [x1, y1] = at(angle + turn * 0.2, arx, ary);
    const [x2, y2] = at(angle + turn * 0.8, arx, ary);
    return `<path d="M ${ceil1(x1)} ${ceil1(y1)} A ${ceil1(arx)} ${ceil1(ary)} 0 0 1 ${ceil1(x2)} ${ceil1(y2)}" fill="none" stroke="var(--muted)" stroke-width="2" marker-end="url(#arrow)"/>${card(ceil1(mx - cardW / 2), ceil1(my - cardH / 2), cardW, cardH, item.label, item.description || '', index === 0, String(index + 1).padStart(2, '0'))}`;
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
    const inner = pyramid ? width - 2 * 64 : width - 2 * 64;
    return `<g>${pyramid ? `<polygon points="${points}" fill="${index === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${index === 0 ? 'var(--accent)' : 'var(--rule-strong)'}"/>` : `<rect x="${x0}" y="${y0}" width="${width}" height="${h - 8}" rx="6" fill="${index === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${index === 0 ? 'var(--accent)' : 'var(--rule-strong)'}"/>`}
      <text x="${x0 + 26}" y="${y0 + (h - 8) / 2 + 4}" class="eyebrow">${String(index + 1).padStart(2, '0')}</text>${fitText(item.label, center, y0 + 4, { w: inner, h: h - 16, size: 17, weight: 720, min: 10, anchor: 'middle', valign: 'middle' })}</g>`;
  }).join('');
}

function vennSvg(spec, box) {
  const sets = spec.data.sets;
  const cx = box.width / 2;
  const three = sets.length === 3;
  const radius = three ? Math.min(box.contentH * 0.33, box.contentW * 0.28) : Math.min(box.contentH * 0.46, box.contentW * 0.3);
  const cy = box.header + box.contentH / 2 + (three ? radius * 0.06 : 0);
  const positions = three ? [[cx, cy - radius * 0.5], [cx - radius * 0.62, cy + radius * 0.38], [cx + radius * 0.62, cy + radius * 0.38]] : [[cx - radius * 0.58, cy], [cx + radius * 0.58, cy]];
  // Labels sit in the part of each circle no other circle covers.
  const slots = three
    ? [{ x: cx, y: cy - radius * 0.98, w: radius * 1.1, h: radius * 0.5 }, { x: cx - radius * 1.0, y: cy + radius * 0.74, w: radius * 0.66, h: radius * 0.46 }, { x: cx + radius * 1.0, y: cy + radius * 0.74, w: radius * 0.66, h: radius * 0.46 }]
    : [{ x: cx - radius * 1.0, y: cy, w: radius * 0.98, h: radius * 1.0 }, { x: cx + radius * 1.0, y: cy, w: radius * 0.98, h: radius * 1.0 }];
  const overlap = three ? { x: cx, y: cy + radius * 0.09, w: radius * 0.4, h: radius * 0.3 } : { x: cx, y: cy, w: radius * 0.7, h: radius * 0.8 };
  return `${sets.map((item, index) => `<circle cx="${positions[index][0]}" cy="${positions[index][1]}" r="${radius}" fill="${index === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${index === 0 ? 'var(--accent)' : 'var(--rule-strong)'}" stroke-width="2"/>${fitText(item.label, slots[index].x, slots[index].y - slots[index].h / 2, { w: slots[index].w, h: slots[index].h, size: 16, weight: 720, min: 10, anchor: 'middle', valign: 'middle' })}`).join('')}
  ${spec.data.overlapLabel ? fitText(spec.data.overlapLabel, overlap.x, overlap.y - overlap.h / 2, { w: overlap.w, h: overlap.h, size: 16, weight: 760, min: 10, anchor: 'middle', valign: 'middle' }) : ''}`;
}

function columnsSvg(spec, box, columns) {
  const gap = 10;
  const width = (box.contentW - gap * (columns.length - 1)) / columns.length;
  const height = box.contentH - 18;
  return columns.map((column, index) => {
    const x0 = box.margin + index * (width + gap);
    const rowH = (height - 66) / column.items.length;
    return `<g><rect x="${x0}" y="${box.header + 8}" width="${width}" height="${height}" rx="7" fill="${index === 2 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="${index === 2 ? 'var(--accent)' : 'var(--rule)'}"/>${fitText(column.title, x0 + 16, box.header + 14, { w: width - 32, h: 38, size: 15, weight: 760, min: 10, valign: 'middle' })}<line x1="${x0 + 14}" y1="${box.header + 56}" x2="${x0 + width - 14}" y2="${box.header + 56}" stroke="var(--rule)"/>${column.items.map((item, itemIndex) => fitText(item.label, x0 + 16, box.header + 66 + itemIndex * rowH, { w: width - 32, h: rowH - 8, size: 13, weight: 540, min: 10 })).join('')}</g>`;
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
  return `<g><rect x="${box.margin}" y="${top}" width="${firstW}" height="${rowH}" fill="var(--ink)"/>${fitText('Activity', box.margin + 16, top, { w: firstW - 32, h: rowH, size: 15, weight: 720, fill: 'var(--paper)', valign: 'middle' })}${roles.map((role, index) => `<rect x="${box.margin + firstW + index * columnW}" y="${top}" width="${columnW}" height="${rowH}" fill="${index === 0 ? 'var(--accent)' : 'var(--ink)'}"/>${fitText(role.label, box.margin + firstW + index * columnW + columnW / 2, top + 4, { w: columnW - 14, h: rowH - 8, size: 13, weight: 720, fill: 'var(--paper)', anchor: 'middle', min: 9, valign: 'middle' })}`).join('')}${activities.map((activity, row) => {
    const y0 = top + rowH * (row + 1);
    return `<rect x="${box.margin}" y="${y0}" width="${firstW}" height="${rowH}" fill="var(--paper-2)" stroke="var(--rule)"/>${fitText(activity.label, box.margin + 16, y0 + 4, { w: firstW - 32, h: rowH - 8, size: 14, weight: 650, min: 9.5, valign: 'middle' })}${roles.map((role, index) => { const value = assignment.get(`${activity.id}:${role.id}`) || ''; const px = box.margin + firstW + index * columnW; return `<rect x="${px}" y="${y0}" width="${columnW}" height="${rowH}" fill="${value === 'A' || value === 'R' ? 'var(--accent-soft)' : 'var(--paper)'}" stroke="var(--rule)"/>${value ? `<text x="${px + columnW / 2}" y="${y0 + rowH / 2 + 6}" text-anchor="middle" font-size="18" font-weight="760">${value}</text>` : ''}`; }).join('')}`; }).join('')}</g>`;
}

function swimlaneSvg(spec, box) {
  const lanes = spec.data.lanes;
  const labelW = Math.min(180, box.contentW * 0.2);
  const laneH = (box.contentH - 8) / lanes.length;
  return lanes.map((lane, row) => {
    const y0 = box.header + 8 + row * laneH;
    const stepW = (box.contentW - labelW - 16) / lane.steps.length;
    return `<g><rect x="${box.margin}" y="${y0}" width="${labelW}" height="${laneH - 8}" fill="${row === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="var(--rule-strong)"/>${fitText(lane.label, box.margin + 16, y0 + 6, { w: labelW - 32, h: laneH - 20, size: 15, weight: 760, min: 10, valign: 'middle' })}${lane.steps.map((step, index) => card(box.margin + labelW + 12 + index * stepW, y0 + 8, stepW - 12, laneH - 24, step, '', row === 0 && index === 0)).join('')}</g>`;
  }).join('');
}

function fishboneSvg(spec, box) {
  const categories = spec.data.categories;
  const left = box.margin + 10;
  const effectW = Math.min(200, box.contentW * 0.2);
  const effectH = 120;
  const spineEnd = box.width - box.margin - effectW - 28;
  const mid = box.header + box.contentH / 2;
  const effectX = spineEnd + 14;
  const effect = `<g><rect x="${effectX}" y="${mid - effectH / 2}" width="${effectW}" height="${effectH}" rx="8" fill="var(--accent-soft)" stroke="var(--accent)"/>${fitText(spec.data.effect, effectX + 16, mid - effectH / 2 + 12, { w: effectW - 32, h: effectH - 24, size: 16, weight: 720, min: 10, valign: 'middle' })}</g>`;
  const perSide = Math.ceil(categories.length / 2);
  const slotW = (spineEnd - left - 12) / perSide;
  const textW = slotW - 54;
  return `<line x1="${left}" y1="${mid}" x2="${effectX}" y2="${mid}" stroke="var(--ink)" stroke-width="3" marker-end="url(#arrow)"/>${effect}${categories.map((category, index) => {
    const up = index % 2 === 0;
    const sx = left + Math.floor(index / 2) * slotW;
    const regionTop = up ? box.header + 4 : mid + 16;
    const regionBottom = up ? mid - 16 : box.header + box.contentH - 4;
    const labelH = 40;
    const causes = category.causes;
    const causeH = (regionBottom - regionTop - labelH - 10) / causes.length;
    const labelTop = up ? regionTop : regionBottom - labelH;
    const firstCause = up ? regionTop + labelH + 10 : regionTop;
    const boneEnd = up ? regionTop + labelH / 2 : regionBottom - labelH / 2;
    return `<line x1="${sx + slotW - 4}" y1="${mid}" x2="${sx + slotW - 46}" y2="${boneEnd}" stroke="var(--muted)" stroke-width="2"/>${fitText(category.label, sx, labelTop, { w: textW, h: labelH, size: 14, weight: 760, min: 10, valign: up ? 'top' : 'bottom' })}${causes.map((cause, causeIndex) => fitText(cause.label, sx, firstCause + causeIndex * causeH, { w: textW, h: causeH - 4, size: 12, fill: 'var(--muted)', min: 9.5 })).join('')}`;
  }).join('')}`;
}

function journeySvg(spec, box) {
  const { stages, persona } = spec.data;
  const columns = stages.map((stage) => ({ title: stage.label, items: [{ label: stage.action }, ...(stage.pain ? [{ label: `Pain: ${stage.pain}` }] : []), ...(stage.opportunity ? [{ label: `Opportunity: ${stage.opportunity}` }] : [])] }));
  const personaSpace = persona ? 30 : 0;
  const contentBox = { ...box, header: box.header + personaSpace, contentH: box.contentH - personaSpace };
  return `${persona ? `<text x="${box.margin}" y="${box.header + 17}" class="eyebrow">PERSONA · ${x(persona)}</text>` : ''}${columnsSvg(spec, contentBox, columns)}`;
}

function capabilitySvg(spec, box) {
  const { levels, domains } = spec.data;
  const headerH = 48;
  const labelW = Math.min(132, Math.max(96, box.contentW * 0.14));
  const gridLeft = box.margin + labelW;
  const gridW = box.contentW - labelW;
  const colW = gridW / domains.length;
  const rowH = (box.contentH - headerH) / levels.length;
  return `${domains.map((domain, index) => `<rect x="${gridLeft + index * colW}" y="${box.header + 8}" width="${colW}" height="${headerH}" fill="${index === 0 ? 'var(--accent)' : 'var(--ink)'}"/>${fitText(domain.label, gridLeft + index * colW + colW / 2, box.header + 12, { w: colW - 16, h: headerH - 8, size: 14, weight: 760, fill: 'var(--paper)', anchor: 'middle', min: 9, valign: 'middle' })}`).join('')}${levels.map((level, row) => { const y0 = box.header + 8 + headerH + row * rowH; return `${fitText(level.label, gridLeft - 12, y0 + 6, { w: labelW - 24, h: rowH - 14, size: 11, weight: 700, anchor: 'end', min: 8, cls: 'eyebrow', cw: MONO_CW, valign: 'middle' })}${domains.map((domain, col) => { const item = domain.capabilities[row % domain.capabilities.length]; return `<rect x="${gridLeft + col * colW}" y="${y0}" width="${colW}" height="${rowH - 6}" fill="var(--paper-2)" stroke="var(--rule)"/>${fitText(item.label, gridLeft + col * colW + 14, y0 + 6, { w: colW - 28, h: rowH - 18, size: 13, weight: 650, min: 9.5, valign: 'middle' })}`; }).join('')}`; }).join('')}`;
}

function strategySvg(spec, box) {
  const rows = [['Financial', spec.data.financial], ['Customer', spec.data.customer], ['Internal process', spec.data.internalProcess], ['Learning & growth', spec.data.learningGrowth]];
  const rowH = (box.contentH - 8) / rows.length;
  return rows.map(([label, items], index) => {
    const y0 = box.header + 8 + index * rowH;
    const cardW = (box.contentW - 170) / items.length;
    return `<g><rect x="${box.margin}" y="${y0}" width="150" height="${rowH - 8}" fill="${index === 0 ? 'var(--accent-soft)' : 'var(--paper-2)'}" stroke="var(--rule-strong)"/>${fitText(label, box.margin + 16, y0 + 6, { w: 118, h: rowH - 20, size: 15, weight: 760, min: 10, valign: 'middle' })}${items.map((item, itemIndex) => card(box.margin + 166 + itemIndex * cardW, y0 + 8, cardW - 12, rowH - 24, item.label, '', index === 0 && itemIndex === 0)).join('')}</g>`;
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
  const briefLines = [
    spec.brief.decision && `Decision · ${spec.brief.decision}`,
    [spec.brief.audience && `For · ${spec.brief.audience}`, spec.brief.owner && `Owner · ${spec.brief.owner}`, spec.brief.asOf && `As of · ${spec.brief.asOf}`].filter(Boolean).join('  ·  '),
  ].filter(Boolean);
  const headerMeta = `<text x="${box.width - box.margin}" y="${box.margin - 8}" text-anchor="end" class="eyebrow">${x(spec.brand.name || `${spec.family} · ${spec.preset}`)}</text>${briefLines.map((line, index) => `<text x="${box.width - box.margin}" y="${box.margin + 6 + index * 12}" text-anchor="end" class="meta">${x(line)}</text>`).join('')}`;
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
  ${textLines(spec.title, box.margin, box.heading.titleY, { size: box.heading.titleSize, weight: 760, max: box.heading.titleMax, lines: 3, leading: box.heading.titleLeading, cls: 'diagram-title' }).replace('<text ', `<text font-family="${x(spec.theme.displayFont)}" letter-spacing="-.03em" `)}
  ${spec.subtitle ? textLines(spec.subtitle, box.margin, box.heading.subtitleY, { size: 15, fill: 'var(--muted)', max: box.heading.subtitleMax, lines: 2, leading: 1.3, cls: 'diagram-subtitle' }) : ''}
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
  const url = process.env.DIAGRAMS_FOR_AGENTS_TELEMETRY_URL || 'https://diagrams.4agents.fyi/api/v1/telemetry';
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
