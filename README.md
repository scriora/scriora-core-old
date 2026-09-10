<p align="center">
  <img src=".github/assets/scriora-mark.png" width="72" height="72" alt="Scriora" />
</p>

<h1 align="center">Scriora</h1>

<p align="center">
  Open-source AI social growth OS.<br />
  Schedule with truth. Grow from evidence. The human stays in control.
</p>

<p align="center">
  <a href="#getting-started">Getting started</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
  ·
  <a href="LICENSE">Apache-2.0</a>
</p>

<p align="center"><sub>skree-OR-ah · سكريورا</sub></p>

## What it is

Scriora is a self-hostable system for social publishing and growth.

Use it as a **Classic** scheduler: connect official accounts, write, schedule, and publish.  
Or run **Mission**: set a business goal, approve the plan, then let the agent draft and execute under your gate.

First network: LinkedIn. More platforms follow on official APIs only.

## Features

- Compose, drafts, calendar, and a durable publish queue
- Official OAuth — no cookies, no scrapers, no unofficial bots
- Human approval before anything goes live
- Analytics from real platform data, never invented lift
- Goals, strategy, and learning when you turn Mission on
- MCP and CLI for agents that must follow the same rules

## Getting started

Requires Node 22 and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Then:

- Web: `pnpm --filter @scriora/web dev`
- API: `pnpm --filter @scriora/api dev` (`GET /health`)
- Worker: idle until queues exist (`pnpm --filter @scriora/worker dev`)

Self-host Compose and Cloud signup land after Classic LinkedIn.

## Tech stack

TypeScript · Node 22 · pnpm · PostgreSQL · Redis · BullMQ

## License

[Apache License 2.0](LICENSE)
