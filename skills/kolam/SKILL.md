---
name: kolam
description: Turn messy business, product, or technical context into the most useful diagram as a private self-contained HTML/SVG artifact, or use Kolam Verified for automatic framework selection and server-side evidence validation. Use for SWOTs, quadrants, comparisons, flows, timelines, architecture diagrams, branded diagrams, Mermaid redraws, and requests to visualize prose without generic AI boxes.
---

# Kolam

Choose the visual before drawing it. Default to Local Mode so the user's source material stays on their machine. Use Verified Mode only when the user asks for automatic framework judgment, stronger grounding, or an API/MCP result.

## Workflow

1. Read the supplied context and identify the reader's decision.
2. Read [references/visual-selection.md](references/visual-selection.md). Pick one supported family and one destination preset.
3. For a branded output, read [references/brand.md](references/brand.md). Propose extracted tokens before saving them.
4. Create a JSON spec using [assets/spec.example.json](assets/spec.example.json) as the shape. Keep the user's full source in `source`; attach an exact `evidence` quote to every claim when the selected family requires it.
5. Render and validate:

   ```bash
   node <skill-dir>/scripts/render.mjs input.kolam.json output.html --svg output.svg --receipt output.receipt.json
   node <skill-dir>/scripts/validate-artifact.mjs output.html
   ```

6. Show the HTML artifact and report the chosen family, anything deliberately omitted, and whether grounding is `local-exact-quote` or `verified`.

## Mode selection

### Local Mode — default

- No account, API key, hosted renderer, or content upload.
- Supported families: `swot`, `quadrant`, `comparison`, `flow`, `timeline`, `architecture`.
- Produces source-editable HTML with inline SVG, optional standalone SVG, and a machine-readable receipt.
- The renderer rejects unsupported families, unsafe theme values, duplicate IDs, dangling connections, and missing exact-quote evidence.

### Verified Mode — explicit

Read [references/verified-mode.md](references/verified-mode.md). Use the installed `render_diagram` MCP tool when available. Otherwise call the documented Kolam API only after confirming the user is comfortable sending the supplied context to Kolam.

Verified Mode is the right choice when:

- the user wants Kolam to choose from the broader business-framework catalogue;
- invented or weakly supported business claims would be costly;
- an application needs a stable `VisualPayload` and hosted render URL;
- the local six-family set cannot represent the decision honestly.

Never describe Local Mode as equivalent to Verified Mode. Exact substring checks prove provenance, not analytical correctness.

## Mermaid redraw

For a Mermaid flowchart, convert first:

```bash
node <skill-dir>/scripts/import-mermaid.mjs source.mmd draft.kolam.json
```

The importer supports `flowchart`/`graph` nodes and directed arrows. It intentionally rejects unsupported Mermaid syntax instead of silently dropping it. Review the resulting labels, add the original context and evidence if needed, then render normally.

## Output rules

- One diagram, one dominant reading path.
- Use at most nine primary nodes; split overview and detail beyond that.
- Use one accent for at most two focal elements.
- Prefer deletion over shrinking type.
- Keep the final artifact useful in a static frame.
- Never invent missing facts to fill a framework slot.
- Never send local content to a network service without making the mode change explicit.
