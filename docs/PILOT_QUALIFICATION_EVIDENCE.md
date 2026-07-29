# Controlled-pilot qualification evidence

Wave 8 is a release-evidence gate. Deterministic tests protect implementation behavior, but they
cannot qualify live entitlements, provider output, physical media codecs, device memory, browser
interruptions, or cleanup indicators. The gate passes only when content-free evidence from the
exact release-candidate commit covers every row in the approved provider and physical matrix.

The machine-readable matrix is
[`qualification/required-matrix.json`](qualification/required-matrix.json). It is derived from the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md); changing it requires an
explicit product-owner decision and requalification of affected rows.

## Recording a pass

1. Build and test the exact candidate commit. Run `npm run quality`, `npm run test:e2e`, and the
   other release commands before paid or physical qualification.
2. Follow [the live provider procedure](LIVE_PROVIDER_SMOKE.md), [manual QA](MANUAL_QA.md), and the
   [recording memory protocol](RECORDING_MEMORY_POLICY.md). Do not substitute mocks, emulators, a
   different model, or a different device for a required row.
3. Copy
   [`qualification/evidence/example.local-no-key.json.example`](qualification/evidence/example.local-no-key.json.example)
   to a new `.json` file in the same directory. Use one record per provider/local requirement or
   physical target/browser pair.
4. Use the exact `requirementId`, `configurationId`, access mode, device class, and check IDs emitted
   by:

   ```bash
   npm run pilot:qualification:check -- --commit "$(git rev-parse HEAD)" --verbose
   ```

5. Record every check as `pass`, `fail`, or `blocked`. A passing record must have only passing
   checks. A failed or blocked record is valid operational evidence but does not satisfy the gate.
6. Re-run the command. The gate passes only at `7/7` provider/local requirements and `45/45`
   physical target/browser requirements, with no invalid records, all for the requested commit.

The validator is intentionally not part of `npm run quality`: an ordinary developer or CI runner
must not need credentials, paid calls, or physical devices. Release qualification invokes it
explicitly after authorized passes.

## Safe record boundary

The schema is an allowlist. It accepts only:

- UTC recording time and the full 40-character candidate commit;
- the required app-owned configuration identifier and participant/operator access mode;
- generic owner roles, account-environment class, browser/OS version, and anonymous device class;
- required check IDs, pass/fail/blocked result, app-owned safe code, bounded timing or clip
  duration, and output MIME type; and
- the aggregate result.

It rejects extra fields. Do not add notes, prompts, filenames, participant codes, personal media,
provider bodies, raw errors, URLs, request/response headers, network archives, task IDs, voice IDs,
device IDs, credentials, tokens, billing identifiers, or account names. Provider account controls
remain the authority for billing, quota, entitlement, and retention review; the repository record
contains only the approved environment class.

## Freshness and failures

Evidence is commit-specific. A later candidate is open until its own rows pass, even if older
records remain for historical review. Re-run affected rows whenever model/configuration, provider
adapter behavior, recorder MIME selection, sidecar/remux behavior, retention settings, supported
browser/device versions, or the approved matrix changes.

A missing credential, entitlement, policy approval, physical target, or authorized owner is a
`blocked` result. A provider refusal, early session end, unsafe leak, unexpected request, take loss,
memory failure, unsupported codec, or incomplete cleanup is a `fail` result. Neither can be
converted to `pass` by weakening a test, changing a model alias, retrying a billable submission,
using provider fallback, or substituting deterministic automation.
