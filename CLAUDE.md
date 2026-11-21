@AGENTS.md

## Claude Code notes

- For UI and copy work, invoke the `antislop` skill (and `antislop-ui`, `antislop-copywriting`, `antislop-human` as relevant) before writing.
- For the pre-release audit, invoke the `security-audit` skill in full audit mode, as `AGENTS.md` requires.

## Subagents

Definitions are in `.claude/agents/`: `test-runner`, `docs-checker`, `code-explorer`, `translator` (haiku) and `spec-reviewer` (sonnet).

- Delegate mechanical, high-volume or read-only work to them to save tokens. Pick the cheapest model that can do the job.
- Keep in the main model: architecture and spec decisions, security, crypto and vault code, S3 orchestration logic, anything that writes production code across modules, and all git operations.
- Subagents never commit, push, change git config or touch signing.
- Verify a subagent's claim yourself before acting on it when it affects code or docs.
