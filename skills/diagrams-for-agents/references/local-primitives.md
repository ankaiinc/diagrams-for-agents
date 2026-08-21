# Local primitives

Local Mode is the private, deterministic path. It supports seventeen bounded families and produces only self-contained HTML, SVG, and receipts. Do not use this reference to imply that Local Mode performs framework selection; it does not.

## Pick the primitive by the decision

| Family | Use it to answer |
| --- | --- |
| `cycle` | What repeatable loop should the team run? |
| `pyramid` | What hierarchy, maturity ladder, or foundation-to-outcome story matters? |
| `stack` | What layers build on one another? |
| `venn` | Where do two or three groups overlap? |
| `swimlane` | Which handoff happens across people or systems? |
| `raci` | Who is responsible, accountable, consulted, or informed? |
| `sipoc` | What is the operating boundary from supplier to customer? |
| `fishbone` | What cause categories should be investigated? |
| `journey-map` | Where does a customer or user experience friction across stages? |
| `capability-map` | Which business capabilities exist and where are the gaps? |
| `strategy-map` | How do enablers connect to outcomes and an objective? |

The original local families remain available: `swot`, `quadrant`, `comparison`, `flow`, `timeline`, and `architecture`.

## Required shapes

Keep labels short. All arrays are intentionally bounded so the artifact remains legible in a static frame.

```json
{ "family": "cycle", "data": { "levels": [{ "label": "Plan" }, { "label": "Do" }, { "label": "Learn" }] } }
{ "family": "pyramid", "data": { "levels": [{ "label": "Foundation" }, { "label": "Outcome" }] } }
{ "family": "stack", "data": { "levels": [{ "label": "Data" }, { "label": "Product" }] } }
{ "family": "venn", "data": { "sets": [{ "label": "Desirable" }, { "label": "Viable" }], "overlapLabel": "Focus" } }
{ "family": "swimlane", "data": { "lanes": [{ "label": "Customer", "steps": ["Request", "Approve"] }, { "label": "Ops", "steps": ["Review", "Deliver"] }] } }
{ "family": "raci", "data": { "roles": [{ "id": "lead", "label": "Lead" }, { "id": "design", "label": "Design" }], "activities": [{ "id": "decide", "label": "Decide" }, { "id": "ship", "label": "Ship" }], "assignments": [{ "activity": "decide", "role": "lead", "value": "A" }, { "activity": "decide", "role": "design", "value": "R" }, { "activity": "ship", "role": "lead", "value": "A" }, { "activity": "ship", "role": "design", "value": "R" }] } }
{ "family": "sipoc", "data": { "suppliers": [{ "label": "Partner" }], "inputs": [{ "label": "Brief" }], "processSteps": [{ "label": "Review" }], "outputs": [{ "label": "Plan" }], "customers": [{ "label": "Team" }] } }
{ "family": "fishbone", "data": { "effect": "Missed launch", "categories": [{ "label": "People", "causes": ["No owner"] }] } }
{ "family": "journey-map", "data": { "persona": "New customer", "stages": [{ "label": "Discover", "action": "Search", "pain": "Too much choice", "opportunity": "Curate" }, { "label": "Decide", "action": "Compare" }] } }
{ "family": "capability-map", "data": { "levels": [{ "label": "Core" }, { "label": "Differentiating" }], "domains": [{ "label": "Acquisition", "capabilities": [{ "label": "Campaigns" }, { "label": "Analytics" }] }, { "label": "Service", "capabilities": [{ "label": "Support" }] }] } }
{ "family": "strategy-map", "data": { "financial": [{ "label": "Sustainable growth" }], "customer": [{ "label": "Trust" }], "internalProcess": [{ "label": "Reliable delivery" }], "learningGrowth": [{ "label": "Team capability" }] } }
```

For a field-level example, use the bounded fixtures in `tests/renderer.test.mjs`. Move to Verified Mode when the user needs the system to decide the framework, needs a specialized visual not listed here, or needs server-side evidence validation.
