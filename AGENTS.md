<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BudgetSimulator

Next.js 16 (App Router) React 19 app. Single page: budget fields, account types, savings-strategy simulations. All client-side, no API routes or backend.

## Commands

- `npm run dev` — dev server
- `npm run lint` — eslint (flat config, `eslint.config.mjs`)
- `npm run build` — `next build`; the only typecheck gate (no separate `typecheck` script)
- No test framework configured.

## Code layout

- `app/page.tsx` — everything lives here: `Budget`, `Accounts`, `Simulation` components exported from one file, plus `Summary`/`Chart` stubs (`//TODO`).
- `@/*` path alias maps to repo root.

## Gotchas

- Tailwind v4 via `@tailwindcss/postcss`: no `tailwind.config`; theme defined in `app/globals.css` with `@theme`.
- Native `<select>`/`<button>` elements so far, no component library.
- TODO comments in `app/page.tsx` (top-level block) are the de-facto roadmap: browser storage persistence, import/export, net-worth/interest comparison table and chart.