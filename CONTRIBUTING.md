# Contributing to Scriora

Thank you for wanting to help. This file is the **project policy**.  
The [README](README.md) explains the product. This file explains what we merge.

Sign the [CLA](CLA.md) once (org members are already covered). License: [Apache-2.0](LICENSE).

## We accept

- Fixes and features that use **official platform APIs** only
- Tests for publish, OAuth, tenant isolation, and analytics honesty
- Docs that match what the code can actually do
- Small, reviewable PRs (`feat/…`, `fix/…`, `docs/…`) against `main`
- AI-assisted work **if you** can explain every hunk and are the named author

## We reject (even if CI is green)

- Cookie, browser-extension, or scraper publishing
- Unofficial / private endpoints presented as a supported adapter
- Fake analytics, hard-coded lift, or treating HTTP 201 as “published”
- Retrying an **unknown** provider outcome as if it failed
- Secrets, `.env` with live keys, leaked DSNs
- Unbounded MCP or public-API loops
- PRs that mix formatter noise with a publish or RLS change
- Unreviewed agent dumps pasted as a pull request

## Before you write code

1. Official platform APIs only. No cookies, scrapers, or unofficial endpoints.
2. Touching publish, OAuth, RLS, or pricing? Open an **issue** first.
3. Analytics must come from real platform data, never invented lift.

## Commit messages

Use [`.github/commit-template.txt`](.github/commit-template.txt). The **type** and **scope** change with the diff; the shape does not.

Examples:

- `feat(domain): reject draft-to-published without approval`
- `brand(web): use the head mark without a nested app-icon plate`
- `chore(repo): ignore Next.js generated agent stubs`
- `docs(ux): point mascot paths at brand/`

One concern per commit. Do not mix formatter noise with publish, RLS, or brand assets.
Do not put product-roadmap phase numbers in the subject.

## Sending a pull request

1. Fork, branch from `main`, one concern per PR.
2. Add tests if the change can republish, cross tenants, or invent metrics.
3. Fill the PR template checklist.
4. Wait for **this repository’s** checks. You do **not** need Cloud production deploys to be green.

Each Scriora repo has its own workflows. Do not copy `scriora-core` Actions into MCP, docs, or CLI unchanged.

## Community

Use GitHub issues for decisions. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).  
Security reports go to [SECURITY.md](SECURITY.md), not a public issue.
