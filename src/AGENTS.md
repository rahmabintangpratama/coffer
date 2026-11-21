# src/

Application code. Project-wide rules are in [../AGENTS.md](../AGENTS.md); architecture is in [../docs/technical-spec.md](../docs/technical-spec.md) section 1.

## Layers (imports point down only)

| Layer | Path | May import |
|---|---|---|
| App shell | `app/` | everything below |
| Features | `features/<area>/` | `components`, `lib/*`; other features only via their `index.ts` |
| Components | `components/` | `styles`, types from `lib/i18n` |
| Libraries | `lib/s3`, `lib/storage`, `lib/providers`, `lib/i18n` | each other as below; never React, JSX or `components` |

- `lib/s3` may import `lib/storage` (credentials provider) and `lib/providers` (types, addressing). `lib/storage` must not import `lib/s3`.
- `lib/` code is framework-free so it runs in Vitest on Node and in integration tests.
- Enforce with lint (`no-restricted-imports`); do not work around it with relative `../../` paths.

## Entry and routing

- `main.tsx` imports `styles/tailwind.css`, mounts `<div class="cf-root"><div class="cf-app">`.
- Hash routing (TanStack Router). Keys live only in the fragment. Do not use `history.pushState` paths.
- Routes: `files`, `trash`, `starred`, `storage`, `settings/*`, `home`; preview and details are search params.

## State boundaries

- Server state: TanStack Query only. Do not copy listings into other stores.
- Session state: one small `zustand` store (active connection, selection, transfer panel, toasts).
- Decrypted credentials exist only inside `lib/storage/vault`. Never put them in React state, context, the query cache, stores or props.
- Persistent state only through `lib/storage` (see its `AGENTS.md`).
- Clear query cache and session store on lock.

## Rules

- Features own their UI, hooks and tests; shared UI goes to `components/`, shared logic to `lib/`.
- A feature that renders bucket data must use the safe renderers in `features/preview` or plain text nodes.
- Portals mount inside `.cf-root`.
- Lazy-load heavy chunks (`pdfjs-dist`, `fflate`, Markdown, S3 client after connect) with dynamic `import()`.
- No `console.*`; use the logger with typed codes.
