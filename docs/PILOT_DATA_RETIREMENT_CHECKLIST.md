# Controlled-pilot data retirement

Complete this checklist for every participant. Detach, Reset, and character deletion do not remove
immutable reference bytes; only this whole-environment procedure satisfies the
[pilot deletion promise](CONTROLLED_PILOT_RELEASE_CONTRACT.md#participant-data-promise).

Never target a repository, home directory, cloud-synced folder, credential directory, shared pilot
root, unresolved variable/glob, or symbolic link.

## Before the first session

- [ ] Record only an anonymous participant code, first/final scheduled dates, and cleanup deadline.
- [ ] Create a fresh browser profile used only for this participant.
- [ ] Create and resolve one new participant-specific leaf directly below the reviewed
      operator-controlled pilot root.
- [ ] Verify the leaf is an absolute, non-symbolic-link path, is not shared, and contains no other
      participant’s data; set that exact path as `LIGHTFRAME_DATA_DIR`.
- [ ] Start with `PILOT_ACCESS_MODE=participant`; verify Wiro is unavailable and the provider-free
      Local/upload/direct-save/local-Voice path still works.

Do not record names, email, prompts, media, device/provider IDs, bodies, URLs, headers, or
credentials.

## At final engagement, withdrawal, or cancellation

- [ ] Set the deadline: within 24 hours of this event and no later than day eight after first use.
- [ ] Stop recording/AI, close Studio, stop the API, and verify camera, microphone, WebRTC, and
      provider activity ended.
- [ ] Verify no active browser upload/poll/download/remux remains and the participant's
      `.tmp/video-jobs` subtree contains no retained source, reference, or provider result.
- [ ] Clear localStorage, IndexedDB, Cache Storage, service-worker data, and permissions for the
      exact loopback origin.
- [ ] Remove the dedicated browser profile through browser controls.
- [ ] Re-resolve the pilot root and participant leaf; stop if either differs, is missing/shared, or
      the leaf is not exactly one child below the root.
- [ ] Move only that leaf to the operating-system Trash. Do not recursively remove it from a shell
      or target the shared root.
- [ ] Start the API with a new empty disposable directory and verify former asset IDs return the
      safe not-found response.
- [ ] Reconcile Wiro `InputOutputDelete` and other provider account controls. Any unexplained
      cleanup warning fails retirement.
- [ ] Verify the shared root and every unrelated participant leaf remain present.
- [ ] Have the Evidence Recorder and Support & Escalation Owner initial the content-free record.
- [ ] Permanently remove only the specifically reviewed trashed leaf.
- [ ] At cohort close, retain aggregated counts only and remove the participant-code row.

Any path, profile, relationship, or provider-cleanup ambiguity blocks the next participant.

## Content-free record

| Field                                         | Result                        |
| --------------------------------------------- | ----------------------------- |
| Anonymous code and session/deadline dates     |                               |
| Exact loopback origin                         |                               |
| Reviewed pilot-root and exact-leaf proof      | Pass / Fail                   |
| Browser site/profile retirement               | Pass / Fail                   |
| Former asset ID absent in empty environment   | Pass / Fail                   |
| Provider and video-job cleanup reconciliation | Pass / Fail / N/A             |
| Shared-root and sibling preservation          | Pass / Fail                   |
| Evidence Recorder initials/time               |                               |
| Support & Escalation Owner initials/time      |                               |
| Final outcome                                 | Pass / Block next participant |

Before admitting participant data, and after changing this procedure, run:

```bash
pnpm pilot:data-retirement:drill
```

The drill uses disposable temporary data to prove exact-leaf retirement, retired-ID absence, and
shared-root/sibling preservation. It does not replace the real checklist.
