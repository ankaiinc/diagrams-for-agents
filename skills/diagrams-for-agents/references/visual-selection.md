# Visual selection

Pick the diagram that helps the reader make the next decision, not the one that displays the most information.

| Reader needs to understand | Family | Required shape | Grounding default |
|---|---|---|---|
| Internal/external advantages and risks | `swot` | Four named sections with 1–4 items each | Exact quote per item |
| Positioning on two meaningful axes | `quadrant` | Axis labels plus 2–8 positioned points | Exact quote per point |
| Tradeoffs between 2–4 alternatives | `comparison` | Columns with matched decision criteria | Exact quote per item |
| Ordered work or decision logic | `flow` | 2–9 nodes and directed edges | Optional |
| Milestones or change over time | `timeline` | 2–8 dated or ordered events | Optional |
| Components, boundaries, and dependencies | `architecture` | 2–9 components and directed connections | Optional |
| Reinforcing stages or flywheels | `cycle` | 2–8 ordered stages | Optional |
| Layered hierarchy or maturity | `pyramid` / `stack` | 2–8 ordered levels | Optional |
| Overlap or shared territory | `venn` | 2–3 named sets | Optional |
| Handoffs and ownership across teams | `swimlane` / `raci` | 2–5 lanes, or activities × roles | Optional |
| End-to-end operating system | `sipoc` / `journey-map` | 5 SIPOC columns, or 2–6 stages | Optional |
| Root causes, capability, or strategy | `fishbone` / `capability-map` / `strategy-map` | Bounded domain-specific structure | Optional |

## Destination presets

- `doc-wide`: articles, documentation, and inline reports; 1200×700.
- `slide-16x9`: decks and projected reviews; 1600×900 with larger type.
- `social-square`: shareable social preview; 1080×1080 and fewer elements.
- `fit`: flexible working artifact; 1200×800.

## Complexity budget

Use no more than nine primary nodes and twelve connections. A SWOT may contain up to sixteen short items. A comparison may contain four columns with five items each. If the source exceeds the budget, preserve the decision-critical facts and list omitted detail beside the deliverable.

Do not use a diagram when a sentence, list, or three-column table communicates the decision more clearly.

## Local versus Verified selection

Local Mode now covers 17 durable primitives. Use it when the supplied context can
fill the family schema directly and the user needs an offline artifact. Use Verified
Mode for the broader framework catalogue, automatic selection from ambiguous
context, or specialist syntax such as UML, C4, ER diagrams, Gantt, and quantitative
charts. Never silently move confidential material into Verified Mode.
