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
- `npm test` — vitest (jsdom, `vitest.config.mts`); tests colocated as `*.test.ts(x)` in `lib/` and `app/`
- `npm run build` — `next build`; the typecheck gate (no separate `typecheck` script)

## Code layout

- `lib/model.ts` — pure data model: `Budget`, `Account`, `Allocation`/`StrategyStep`/`Strategy`, helpers (`isDebt`, `liquidityRank`). No JSX, JSON-friendly (browser storage friendly).
- `lib/simulate.ts` — pure monthly engine: `simulate(budget, accounts, strategy)` → `Projection`. Simple monthly compounding; cascade semantics fund earlier steps first.
- `lib/templates.ts` — strategy generators (avalanche, liquidity-first, match-first, computed max-net-worth) produce editable `Strategy` objects from the account list.
- `app/page.tsx` — all components (`Home`, `BudgetEditor`, `AccountsEditor`, `Simulation`, `Results`, charts as raw SVG polylines, no chart lib).
- `@/*` path alias maps to repo root.

## Gotchas

- Tailwind v4 via `@tailwindcss/postcss`: no `tailwind.config`; shared classes (`card`, `btn-primary`, `field`, `table`) defined with `@apply` in `app/globals.css` under `@layer components`. Tailwind v4 errors on `@apply` of another custom class — flatten, don't nest.
- Native `<select>`/`<button>` elements, no component library. Tests query selects via `getByLabelText("account type")` / `"template"`.
- Vitest pinned to v3 / `@vitejs/plugin-react` v4 (latest vitest 5 wants `@types/node` >=22; repo pins ^20).
- Simulation math is intentionally coarse v1: debt compounds like any balance, contribution caps treated as monthly slices (`// ponytail` notes in `lib/simulate.ts`).
- TODO roadmap (top of `app/page.tsx`): browser storage persistence, import/export, strategy step editor. Module layout already supports them.