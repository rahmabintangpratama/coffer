# design/

**Read-only.** This is the approved design and handoff package, the source of truth for UX, tokens, copy, components, provider presets and security-by-design. Never edit anything here, including generated CSS. Project-wide rules are in [../AGENTS.md](../AGENTS.md).

## What each file is for

| File | Use it for |
|---|---|
| `HANDOFF.md` | Entry point: stack, layout rules, S3 facts the UI relies on. |
| `tokens.json` | Token source (W3C DTCG). |
| `tokens.css`, `tailwind.css` | CSS variables and Tailwind v4 mapping as delivered; the reference the token generator must reproduce. |
| `components.md` | The 37 components and their behavior at 375, 768 and 1440. |
| `button-states.md` | Button, row and chip states, the elevated and inverse scopes. |
| `screens.md` | Board IDs and per-screen notes. |
| `ux-patterns.md` | Selection model, gestures, shortcuts, undo rules. |
| `copy.en.json` | All UI strings (ICU plurals). |
| `types.ts` | Shared TypeScript types. |
| `providers.json` | Provider presets and paste hints. |
| `accessibility.md` | WCAG targets and rules. |
| `SECURITY-DESIGN.md` | Trust boundaries, threats, header proposal, local data inventory. |

## Precedence

The newer files (tokens, components, button-states, accessibility, HANDOFF) win over the older ones (screens, ux-patterns, copy, types, providers, SECURITY-DESIGN) on colors, button states, the elevated scope and the component list.

## Requesting a design change

1. Do not change the file and do not patch around it silently.
2. Add an `OQ-n` (question) or `DC-n` (conflict) entry to [../docs/open-questions.md](../docs/open-questions.md) with the file, the problem, the owner (Design) and a recommended default.
3. Follow the recommended default in code and note the entry in the PR.

Contrast numbers in these files are computed, not observed.
