# Verified Mode

Verified Mode sends the provided context to the configured Kolam service. State this before the first network call in a task.

## Preferred path

Use the plugin's `render_diagram` MCP tool:

- `context`: the user's situation in plain language
- `intent`: optional requested visual; omit it to let Kolam choose

It returns the selected framework, a validated `VisualPayload`, and a hosted viewer link with SVG/PNG downloads.

## Boundaries

- A keyless trial is rate-limited. A `KOLAM_API_KEY` raises the daily allowance.
- The service validates required evidence for named business-framework items, but the user remains responsible for the source facts.
- Anyone with a complete hosted viewer URL can read the payload encoded in that URL.
- Do not put secrets, credentials, regulated personal data, or confidential source material into Verified Mode.

If the tool is unavailable, keep working in Local Mode or provide the exact missing capability. Do not silently replace verification with an ungrounded diagram.
