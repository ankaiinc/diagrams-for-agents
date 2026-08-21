# Brand guidance contract

Use a brand profile when the diagram should look like it belongs inside a product, a board deck, or a documentation system. The profile is portable JSON: an agent can derive it from a repository’s tokens, a design-system document, or a supplied brief, then reuse it without uploading anything.

Save this as `.diagrams-for-agents/brand.json`, pass it with `--brand`, or place it in the spec’s top-level `brand` object.

```json
{
  "name": "Northstar",
  "guidance": "Calm, evidence-first operating artifacts. Use yellow only for a decision that needs attention.",
  "theme": {
    "paper": "#fbfaf7",
    "surface": "#f0f2ed",
    "ink": "#17201c",
    "muted": "#61706a",
    "accent": "#0d8f79",
    "accent2": "#f0c94b",
    "font": "Avenir Next, Helvetica Neue, sans-serif",
    "displayFont": "Avenir Next, Helvetica Neue, sans-serif"
  },
  "style": {
    "tone": "editorial",
    "density": "relaxed",
    "corner": "soft"
  }
}
```

## Meaning of each field

| Field | What it controls |
| --- | --- |
| `name` | Visible provenance in the diagram header and footer. |
| `guidance` | Concise instructions an agent preserves while choosing content and emphasis. It is stored with the artifact but never rendered as body copy. |
| `paper`, `surface`, `ink`, `muted` | Canvas, cards, primary text, and secondary text. |
| `accent`, `accent2` | Primary emphasis and a small secondary signal; do not use them as decoration everywhere. |
| `font`, `displayFont` | Body and heading stacks. Use local or system fonts only. |
| `tone` | `editorial` adds a quiet page grid and a stronger story-led header; `system` is denser and plainer. |
| `density` | `relaxed` or `compact`, depending on the destination. |
| `corner` | `sharp`, `soft`, or `round`; use one value across the artifact. |

## Agent workflow

1. Inspect only the user-provided site, repository, or design-system source.
2. Propose the profile with source locations and a short rationale; do not silently invent brand colors or type.
3. Store the approved profile locally and render it explicitly:

   ```bash
   node <skill-dir>/scripts/render.mjs input.diagrams-for-agents.json output.html --brand .diagrams-for-agents/brand.json --svg output.svg
   ```

4. Add an optional top-level `brief` to make the diagram decision-ready:

   ```json
   { "decision": "Which onboarding bet ships next?", "audience": "Product leadership", "owner": "Growth lead", "asOf": "2026-08-21" }
   ```

The renderer accepts six-digit hex colours and conservative local/system font stacks only. It rejects remote font URLs, CSS imports, arbitrary CSS, and a spec that provides both `brand` and `--brand`.

When no profile is supplied, Local Mode uses Diagrams for Agents’ editorial paper: white canvas, near-black ink, soft stone surfaces, teal primary signal, and yellow secondary signal.
