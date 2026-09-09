# Security Policy

## Supported Versions

Security fixes are applied on the latest `main` branch of this bot.

| Version               | Supported   |
| --------------------- | ----------- |
| `main` (latest)       | Yes         |
| Older tagged releases | Best-effort |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

1. Use GitHub **Security Advisories** on this repository (`Security` → `Report a vulnerability`), or
2. Open a private report via the [security issue template](.github/ISSUE_TEMPLATE/security_issue.md) if the advisory form is unavailable.

You can expect:

- An acknowledgement when the report is received
- A follow-up once the issue has been triaged
- A fix or mitigation on `main` for confirmed issues that affect this codebase

Please include:

- Affected component (command, agent tool, HTTP endpoint, cron)
- Steps to reproduce (without exploit payloads against third-party systems)
- Impact (privilege escalation, data leak, SSRF, RCE, etc.)

## Hardening notes

- Control API requires `CONTROL_TOKEN` (fail-closed; timing-safe compare)
- Outbound fetches should go through `safeFetch` / `checkUrlForSsrf` (fail-closed DNS)
- Restricted agent tools require SOAR admin approval
- Dashboard JWT secret (`JWT_SECRET`) is mandatory in production
