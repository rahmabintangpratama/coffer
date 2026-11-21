# docs/

Product and engineering documentation. Rules here are for writing and updating it; project-wide rules are in [../AGENTS.md](../AGENTS.md).

## Files

- `product-brief.md`: why, who, goals (`G-x`), non-goals, metrics, risks.
- `product-spec.md`: features, `FR-x`, `AC-x.y`, `NFR-x`, release plan.
- `technical-spec.md`: architecture, data, S3 behavior, security, testing.
- `implementation-plan.md`: MVP milestones with FR coverage, tests and demoable exit checks.
- `open-questions.md`: open questions (`OQ-x`), owner decisions (`C-x`), agent decisions (`D-x`), design conflicts (`DC-x`).
- `adr/ADR-NNN-slug.md`: one decision each.

## Header block

Start every document with: purpose, status (`Draft` or `Accepted`), last updated (ISO date), source files in `design/`, and related docs.

## ID conventions

Never reuse or renumber an ID. Retire it with a note.

| Prefix | Meaning | Defined in |
|---|---|---|
| `G-n` | Goal | product-brief |
| `FR-n`, `AC-n.m` | Functional requirement and its acceptance criterion | product-spec |
| `NFR-n` | Non-functional requirement | product-spec |
| `ADR-NNN` | Architecture decision (three digits) | `adr/` |
| `OQ-n`, `C-n`, `D-n`, `DC-n` | Open question, owner decision, agent decision, design conflict | open-questions |

Reference design screens by board ID (`O42_CorsFail`, `S15_Selection`), never by description.

## Traceability rules

- Every `FR-n` has `AC-n.*` written as Given/When/Then, a **States** line, **Edge cases**, and a **Screens** line (or a note saying why there is none).
- Every `AC` must be testable. If you cannot name the test, rewrite it.
- When behavior changes, update the FR, its ACs and the technical spec section in the same change.
- A decision that is hard to reverse gets an ADR. Do not edit an accepted ADR; add a new one that supersedes it.
- Anything undecided becomes an `OQ` with an owner (Product, Design, Eng, Security) and a recommended answer.

## ADR template

```
# ADR-NNN: Title
- Status: Proposed | Accepted | Superseded by ADR-NNN
- Date: YYYY-MM-DD
- Related: FR/NFR IDs, spec links
## Context
## Decision
## Consequences
## Alternatives considered
```

## Style

English only. Short sentences, imperative requirements, no filler. Use relative links; check that every link resolves before finishing.
