# Security Policy

ReFx Hosting runs untrusted game code on shared infrastructure and processes
payments, so we take security seriously. Thank you for helping keep it safe.

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.**

Instead, report privately via one of:

- GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  (Security tab → "Report a vulnerability"), or
- email the maintainers (replace with your project's security contact before
  going to production).

Please include:

- A description of the issue and its impact.
- Steps to reproduce / a proof of concept.
- Affected component(s) and version/commit.
- Any suggested remediation.

We aim to acknowledge reports within **72 hours** and to provide a remediation
timeline after triage. Please give us a reasonable window to fix before any
public disclosure (coordinated disclosure).

## Scope

In scope: `panel-api`, `web`, `node-agent`, the deployment manifests, and the
default configuration. Especially interested in:

- Authentication / session / MFA bypasses.
- Authorization flaws (RBAC or per-server `SubUser` permission escapes,
  cross-tenant access).
- Node-agent isolation/sandbox escapes; path traversal in the file manager or
  SFTP jail; signed-request forgery/replay.
- Secret exposure (TOTP seeds, SFTP/DB passwords, API keys, node tokens).
- Billing/invoice tampering; webhook signature bypass.
- Injection (SQLi via raw queries, command injection in install scripts/startup).

Out of scope: findings that require a compromised host/root on a node, social
engineering, volumetric DoS, and issues in third-party dependencies already
tracked upstream (report those upstream, but tell us if we ship a vulnerable
default).

## Security model (summary)

See [`docs/08-security.md`](docs/08-security.md) for the full architecture.

- **Passwords**: Argon2id. **MFA**: TOTP + WebAuthn.
- **Transport**: TLS 1.3; panel↔agent requests are HMAC-signed with a per-node
  key and a replay window.
- **Secrets at rest**: AES-256-GCM (`SECRETS_ENC_KEY`).
- **AuthZ**: RBAC (CUSTOMER/SUPPORT/ADMIN/OWNER) + per-server permissions.
- **Isolation**: game servers run in containers or resource-limited native
  processes (cgroups v2 / Windows Job Objects); file/SFTP access is jailed to the
  server's data directory.
- **Auditing**: mutating actions are recorded in `AuditLog`.

## Hardening checklist for operators

- Set strong, unique `JWT_*` secrets and a real `SECRETS_ENC_KEY` (`openssl rand -hex 32`).
- Terminate TLS in front of `panel-api`/`web`; replace the agent's self-signed
  certificate with a real one and pin it.
- Restrict node-agent ports (8443/2022) to the panel's egress.
- Use managed Postgres/Redis with network ACLs; never expose them publicly.
- Rotate node bootstrap tokens after enrollment; remove unused API keys.
- Keep dependencies patched (Dependabot + the `security.yml` scans are enabled).
