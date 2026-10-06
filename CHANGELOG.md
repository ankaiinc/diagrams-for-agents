# Changelog

## 0.3.4 — Correct flow routing, measured fit limits and a render quality gate

**Behaviour change: content longer than the limits is now rejected with a clear message instead of being silently clipped.**
Until now the validator accepted up to 120–160 characters per item and 9 nodes, and the renderer then cut the text with
an ellipsis, let it run off its card or printed it over the next item. Now every family has measured fit limits that depend on the preset and on how many nodes/items the diagram has
(`skills/diagrams-for-agents/scripts/fit-limits.mjs`; a 3-node doc-wide flow allows 80-character labels, an 8-node one 32) and a spec that exceeds one fails `validateSpec` with the exact
path, length and allowed length, for example
`data.nodes[2].label is 74 characters; with 6 nodes on doc-wide, flow diagrams fit at most 39; with 8 nodes, 32. Shorten it or split the diagram.`
Text that 0.3.3 sliced without a word (node detail at 140, edge labels at 60, subtitles at 220, the persona, pain and
opportunity fields) is now an error too. The examples and every reference topology still pass unchanged.

- Added `scripts/render-quality-gate.mjs` (repo root): renders every family x preset x {typical, limit, unicode/CJK/RTL, one-long-word, wide brand font} case, loads them in a real browser and fails on truncated, off-canvas, overlapping or overflowing text, overlapping cards and (flow/architecture) bad connectors. Blocking in CI (`.github/workflows/quality.yml`). See `docs/render-quality-gate.md`.
- Limits are in visual cells (CJK, fullwidth and emoji count double) and hold per preset and item count (switching preset or adding items can tighten them); four counts are lower than before (flow 9 → 8 nodes, architecture 12 → 9 connections, quadrant 8 → 7 points, swimlane 5 → 4 lanes); all other counts are unchanged. The Mermaid importer reads the same flow limits.
- Layouts now shrink type to a floor before wrapping further, break words longer than a line, and throw instead of drawing an ellipsis. Cycle (cards overlapped from 7 stages; ellipse layout), quadrant (labels ran off the right edge and over the dots; y-axis labels were clipped), timeline (details were cut; text sat on the stems), venn, journey-map, pyramid/stack (eight levels overflowed), fishbone, swimlane, capability-map and the header (long titles shrink to two lines; the brief wraps onto two lines) were reworked. Flow columns are capped by canvas width and labels in a column gap leave room for a through-connector.
- Limits depend on the header too (compact one-line title vs tall) and unbroken words have their own cap; flow and architecture now take at most 8 nodes (was 9). A real-report corpus (8 neutral specs with real title/label/detail lengths) plus the six examples must render in every preset (plugin tests and the gate's `fixture` level), and `--calibrate` checks the validator against 300 realistic specs per family (0 false accepts, at most 4.3% false rejects). Flow with 5-6 nodes uses 3 columns (wider cards); titles shrink to one line before wrapping.
- The quality gate now measures with bundled OFL fonts (Instrument Sans, Geist Mono, Bricolage Grotesque for the wide-font level) instead of whatever the OS resolves, so Linux CI and macOS agree; Arabic and Hebrew count 1.25 cells per character in the fit rules (CJK 2). Limits were re-tuned against the bundled fonts.
- Added `tests/fit-limits.test.mjs` (every limit enforced with its exact message, regressions for the typical-content defects) and moved the connector checks into `tests/support/flow-problems.mjs`.
- Packaging: `fit.mjs` and `fit-limits.mjs` ship in the skill ZIP; the distribution test asserts both.

### Connector routing (also in 0.3.4): flow and architecture diagrams route every connector correctly

- Fixed backward (retry) connectors that were drawn as forward branches with a hidden arrowhead.
- Fixed connectors that ran behind non-endpoint cards, which made a branch read as a chain.
- Gave every connector its own track and attach point, so no two share a stroke.
- Edge labels are no longer truncated, no longer overprint each other, and sit on a mask at 11 px.
- Cards are sized from their text; detail text no longer lands on the card border.
- Added geometry regression tests (`tests/flow-geometry.test.mjs`) over eight reference topologies. Details: `docs/local-flow-renderer-issues-2026-10-04.md`.

## 0.3.3 — Reliable layouts and accessible install surface

- Added bounded, dynamic title and subtitle layout so valid long headings cannot collide with metadata or diagram content.
- Corrected fishbone, capability-map, journey-map, cycle, flow, and architecture spacing for dense but valid content across document, slide, and square outputs.
- Corrected the public fishbone example so its causes match the renderer's documented object schema.
- Added keyboard, landmark, contrast, touch-target, responsive overflow, and browser-security protections to the public product and install experience.

## 0.3.2 — Reliable generic MCP startup

- Fixed generic MCP manifests and copy-paste instructions so `npx` installs the new self-hosted MCP `0.2.2` tarball as a package, then starts the `diagrams-for-agents-mcp` binary.
- Added package verification that rejects the previously broken `npx <tarball-url>` argument shape.

## 0.3.1 — One clear install path for every agent

- Added a ready-to-upload Claude skill ZIP with the folder shape and metadata Claude expects.
- Added first-class install instructions for Claude, Claude Code, Codex, GitHub Copilot, Cursor, Pi, generic Agent Skills clients, and generic MCP clients.
- Added deterministic distribution checks so ZIP contents, versioned downloads, MCP endpoints, and plugin versions cannot silently drift.
- Moved every public plugin and MCP manifest to the canonical `diagrams.4agents.fyi` hostname.
- Rebuilt the Verified MCP package as `0.2.1` so the distributed client itself uses the canonical hostname instead of relying on a redirect.

## 0.3.0 — Operating primitives in Local Mode

- Expanded Local Mode from six to seventeen bounded, source-editable diagram families.
- Added cycles, pyramids, stacks, Venn diagrams, swimlanes, RACI, SIPOC, fishbone, journey maps, capability maps, and strategy maps.
- Added a portable brand-profile and decision-brief contract: agents can reuse approved design-system guidance while making the diagram’s decision, audience, owner, and date explicit.
- Kept the privacy boundary intact: local rendering remains offline and deterministic; Verified Mode remains the route for automatic framework selection, specialist diagrams, and stronger server-side validation.

## 0.2.0 — Diagrams for Agents

- Renamed the product, skill, plugin, MCP configuration, and generated artifact identity.
- Added the public `diagrams-for-agents` install path and production hostname.
- Preserved compatibility with existing API keys and legacy MCP environment settings.

## 0.1.0 — Initial preview

- Shipped six private local diagram families with exact-quote grounding.
- Added Verified Mode through the hosted MCP server.
