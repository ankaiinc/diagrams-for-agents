import assert from 'node:assert/strict';

import { graphGeometry } from '../../skills/diagrams-for-agents/scripts/render.mjs';

const segmentsOf = (route) => route.pts.slice(1).map((pt, i) => [route.pts[i], pt]);
const rectHit = (x1, y1, x2, y2, r, pad = 1) => Math.max(x1, x2) > r.x + pad && Math.min(x1, x2) < r.x + r.w - pad && Math.max(y1, y2) > r.y + pad && Math.min(y1, y2) < r.y + r.h - pad;

/** Everything the 0.3.3 renderer got wrong in real reports, as machine-checkable rules. */
export function flowProblems(spec, geometry = graphGeometry) {
  const g = geometry(spec);
  const problems = [];
  const nodes = [...g.positions.values()];
  const byId = g.positions;
  assert.equal(g.routes.length, spec.data.edges.length, 'every edge has a route');

  for (const route of g.routes) {
    const { from, to } = route.edge;
    const name = `${from}->${to}`;
    for (const node of nodes) {
      if (node.id === from || node.id === to) continue;
      if (segmentsOf(route).some(([[x1, y1], [x2, y2]]) => rectHit(x1, y1, x2, y2, node))) problems.push(`${name} passes through ${node.id}`);
    }
    // The arrowhead must land on the target boundary and point into the card.
    const target = byId.get(to);
    const [[px, py], [lx, ly]] = [route.pts[route.pts.length - 2], route.pts[route.pts.length - 1]];
    const into = ly === target.y && py < ly ? 'top' : ly === target.y + target.h && py > ly ? 'bottom' : lx === target.x && px < lx ? 'left' : null;
    if (!into) problems.push(`${name}: arrowhead does not point into its target`);
    if (into === 'top' || into === 'bottom') if (lx <= target.x || lx >= target.x + target.w) problems.push(`${name}: arrowhead lands outside the target`);
    const source = byId.get(from);
    const [sx, sy] = route.pts[0];
    const onSource = (sy === source.y || sy === source.y + source.h) && sx > source.x && sx < source.x + source.w || sx === source.x + source.w;
    if (!onSource) problems.push(`${name}: connector does not start on its source card`);
  }
  // No two connectors may share a stroke.
  for (let i = 0; i < g.routes.length; i += 1) {
    for (let j = i + 1; j < g.routes.length; j += 1) {
      for (const [[ax1, ay1], [ax2, ay2]] of segmentsOf(g.routes[i])) {
        for (const [[bx1, by1], [bx2, by2]] of segmentsOf(g.routes[j])) {
          const bothH = ay1 === ay2 && by1 === by2 && Math.abs(ay1 - by1) < 5;
          const bothV = ax1 === ax2 && bx1 === bx2 && Math.abs(ax1 - bx1) < 5;
          if (bothH && Math.min(Math.max(ax1, ax2), Math.max(bx1, bx2)) - Math.max(Math.min(ax1, ax2), Math.min(bx1, bx2)) > 2) problems.push(`#${i + 1} and #${j + 1} share a horizontal stroke`);
          if (bothV && Math.min(Math.max(ay1, ay2), Math.max(by1, by2)) - Math.max(Math.min(ay1, ay2), Math.min(by1, by2)) > 2) problems.push(`#${i + 1} and #${j + 1} share a vertical stroke`);
        }
      }
    }
  }
  // Labels: complete, on nothing else.
  g.routes.forEach((route, i) => {
    const label = route.edge.label;
    if (!label) return;
    const box = route.label;
    if (box.lines.join('').replace(/\s+/g, '') !== label.toUpperCase().replace(/\s+/g, '')) problems.push(`label "${label}" was truncated or changed`);
    nodes.forEach((n) => { if (box.x < n.x + n.w && box.x + box.w > n.x && box.y < n.y + n.h && box.y + box.h > n.y) problems.push(`label "${label}" overlaps card ${n.id}`); });
    g.routes.forEach((other, j) => {
      if (j !== i && segmentsOf(other).some(([[x1, y1], [x2, y2]]) => Math.max(x1, x2) > box.x && Math.min(x1, x2) < box.x + box.w && Math.max(y1, y2) > box.y && Math.min(y1, y2) < box.y + box.h)) problems.push(`label "${label}" sits on connector #${j + 1}`);
      if (j > i && other.label && box.x < other.label.x + other.label.w && box.x + box.w > other.label.x && box.y < other.label.y + other.label.h && box.y + box.h > other.label.y) problems.push(`labels "${label}" and "${other.edge.label}" overlap`);
    });
  });
  // Card text must sit inside its card and never be cut.
  spec.data.nodes.forEach((node) => {
    const p = byId.get(node.id);
    if (p.text.height > p.h) problems.push(`card ${node.id}: text runs to the card border`);
    const joined = (lines) => lines.join(' ');
    if (/…/.test(joined(p.text.title)) || /…/.test(joined(p.text.detail))) problems.push(`card ${node.id}: text was truncated`);
  });
  return problems;
}

