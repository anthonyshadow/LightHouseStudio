# Controlled-pilot qualification evidence

Deterministic tests protect implementation behavior; they do not qualify live entitlements,
provider output, physical codecs/memory, browser interruption, or hardware cleanup indicators.
Release requires content-free evidence from the exact candidate commit for every row in
[`qualification/required-matrix.json`](qualification/required-matrix.json).

**Current repository state:** no committed pass records; the gate is `0/7` provider/local and
`0/45` physical rows.

## Record a result

1. Run the normal release commands for the exact candidate first.
2. Follow [live provider smoke](LIVE_PROVIDER_SMOKE.md), [Manual QA](MANUAL_QA.md), and the
   [recording memory protocol](RECORDING_MEMORY_POLICY.md). Required live/physical rows cannot use
   mocks, emulators, another model, or substitute hardware.
3. Copy
   [`qualification/evidence/example.local-no-key.json.example`](qualification/evidence/example.local-no-key.json.example)
   to a new `.json` record in that directory.
4. Obtain the exact requirement/configuration/access-mode/check IDs from:

   ```bash
   npm run pilot:qualification:check -- --commit "$(git rev-parse HEAD)" --verbose
   ```

5. Mark every check `pass`, `fail`, or `blocked`. A satisfying record has only passing checks.
6. Re-run the validator. Release requires `7/7`, `45/45`, no invalid records, and the requested
   commit on every record.

The validator is deliberately outside `npm run quality`; ordinary development and CI must not need
credentials, paid calls, or physical devices.

## Safe record boundary

The allowlisted schema accepts only:

- UTC time and full 40-character candidate commit;
- required configuration/access mode and generic owner roles;
- account-environment class, browser/OS version, and anonymous device class;
- required check ID/result, app-owned safe code, bounded timing/clip duration, MIME type; and
- aggregate result.

It rejects extra fields. Never add notes, prompts, filenames, participant codes, media, provider
bodies/errors/URLs, headers, network archives, task/voice/device IDs, credentials, tokens, billing
identifiers, or account names.

## Freshness and failure

Evidence is commit-specific. Re-run affected rows when provider/model/configuration, adapter,
recording MIME/sidecar/remux, retention, browser/device versions, or the approved matrix changes.

- `blocked`: required credential, entitlement, approval, owner, account setting, or physical target
  is unavailable.
- `fail`: the attempted row exposed an unsafe leak/request, provider refusal/early end, take loss,
  memory/codec failure, or incomplete cleanup.

Neither becomes a pass by weakening a check, following an alias, retrying an initial billable
submission, switching providers, or substituting automation.
