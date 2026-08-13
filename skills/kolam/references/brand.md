# Brand onboarding

Local artifacts accept five semantic tokens:

- `paper`: background
- `ink`: primary text and strong strokes
- `muted`: secondary text
- `accent`: one or two focal elements
- `font`: local/system font stack

## Website or repository flow

1. Inspect the supplied homepage, stylesheet, or local design-token files.
2. Extract candidate background, text, secondary text, CTA/accent, and font values.
3. Check that `ink` and `accent` are readable on `paper`; adjust only with an explanation.
4. Show the proposed token diff and source locations.
5. After approval, put the values in the spec's `theme` object or save a reusable `.kolam/brand.json` file.

The renderer accepts six-digit hex colours only and a conservative local font-stack syntax. It rejects remote font URLs, CSS imports, and arbitrary CSS.

When no brand is supplied, use Kolam paper: white paper, near-black ink, slate secondary text, and teal accent.
