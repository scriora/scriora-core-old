# Security policy

## Reporting

If you find a vulnerability in Scriora (especially publish, OAuth, token storage, or tenant isolation), **do not** open a public issue.

Email **mohamedshaban_@outlook.com** with:

- repository name
- impact (can it publish, cross tenants, or leak tokens?)
- repro on a **local** or consenting test account only

We will acknowledge as soon as a maintainer sees the report.

## Rules for researchers

- Official APIs and your own accounts only.
- No scraping live customer tenants.
- No “proof” that requires unofficial platform access.

## Supported versions

Until Classic GA, treat `main` on `scriora-core` as the only line. There are no old release branches to patch yet.

## Secrets in PRs

`Secret scan` rejects high-signal credentials. If you accidentally push a secret, rotate it at the provider **before** arguing with CI.
