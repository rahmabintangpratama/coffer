# ADR-006: Danger-tonal contrast deviation on the light surface layer

- **Status:** Accepted (Draft docs)
- **Date:** 2026-11-21
- **Related:** NFR-5 in [product-spec.md](../product-spec.md); [technical-spec.md](../technical-spec.md#12-styling-system); `design/button-states.md` (Surface, acceptance table)

## Context

`design/button-states.md` records one failed acceptance row: on the light **surface** layer, the danger-tonal fill against the layer measures 1.14:1 against a 1.25:1 target. All other targets pass, including the danger-tonal label on its fill (7.46:1 at rest) and its border against the layer (4.36:1).

## Decision

Accept the deviation. The fill is treated as a hint only. Meaning is carried by the border (3:1 or better is required for control edges and is met at 4.36:1), the label contrast and the text of the action, never by the fill alone. No token is changed in the app; `tokens.css` stays as delivered.

## Consequences

- No visual or token change; the design stays the source of truth.
- WCAG 1.4.11 concerns the control boundary, which the 4.36:1 border satisfies.
- The numbers are computed, not observed. The real-browser contrast pass (technical spec 15.7) re-checks this pair; a failure there reopens the question through the design owner.
- Danger-tonal must keep its border everywhere it is used.

## Alternatives considered

- **Darken the fill locally:** diverges from the design and the generated tokens; rejected.
- **Ask design to change the token:** possible later; recorded in [open-questions.md](../open-questions.md#design-conflicts-log).
