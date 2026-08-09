# Security policy

## Supported version

Security fixes are made on the current `main` branch. The repository does not
currently maintain separately supported release lines.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue, discussion, pull
request, or other public channel.

Use GitHub's private vulnerability reporting or a private GitHub security
advisory when that option is available for this repository. If it is not
available, ask the repository owner through an existing private channel to
enable private reporting; do not include sensitive details in a public request.

A useful report includes:

- the affected commit, branch, component, and configuration;
- a concise impact assessment and the conditions required to reproduce it;
- minimal, non-destructive reproduction steps or a proof of concept;
- relevant logs with credentials, personal data, provider payloads, URLs, and
  media removed;
- any known workaround or suggested remediation; and
- whether credentials or other secrets may have been exposed.

Report suspected secret exposure immediately. Maintainers should rotate or
revoke affected credentials through the owning service. Do not place the secret
itself in the report unless the private reporting channel explicitly requires
it.

## Scope

Reports may cover the web app, Elysia API, authentication and ownership,
uploads and media handling, remote imports, provider integrations, local or
cloud persistence, temporary-data cleanup, and credential exposure. The current
loopback-only product boundary reduces some exposure but does not make defects in
these areas out of scope.

## Responsible disclosure

Please avoid accessing data that is not yours, making paid provider calls,
degrading services, or publishing exploit details before the repository owner
has had a reasonable opportunity to investigate and coordinate a fix. Response
and remediation timing depends on severity, reproducibility, and maintainer
availability; this policy does not promise a fixed deadline.
