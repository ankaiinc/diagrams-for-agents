# Changelog

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
