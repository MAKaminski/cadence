# Security policy

Please **don't open a public issue** for a vulnerability. Report it privately through GitHub: [Report a vulnerability](https://github.com/MAKaminski/cadence/security/advisories/new). Expect an acknowledgement within 3 business days.

In scope: the code in this repository and the hosted Cadence service. Areas we care most about:
- tenant isolation (row-level security, `asUser()`)
- OAuth token handling (encrypted at rest by Better Auth)
- the publish path (exactly-once, approved-text hash)
- demo mode being reachable outside localhost or CI

Supported versions: the latest release.
