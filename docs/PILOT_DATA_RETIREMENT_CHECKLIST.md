# Controlled-pilot data retirement checklist

Use this checklist for every participant environment. It implements the approved promise in the
[controlled-pilot release contract](CONTROLLED_PILOT_RELEASE_CONTRACT.md) without pretending that
character removal, draft reset, or relationship detachment deletes immutable reference bytes.

The operator must use a fresh browser profile and one explicitly resolved
`LIGHTFRAME_DATA_DIR` leaf per anonymous participant code. Never use a repository, home directory,
cloud-synced folder, provider-credential directory, shared pilot root, unresolved environment
variable, glob, or symbolic link as the retirement target.

## Before the first session

- [ ] Record an anonymous participant code, first-session date, final scheduled session, and
      cleanup deadline. Do not record a name, email, prompt, media content, device ID, provider
      body, URL, or credential.
- [ ] Create a fresh browser profile used only for this participant.
- [ ] Create a new leaf below the reviewed operator-controlled pilot root.
- [ ] Resolve the leaf to an absolute path and record that exact value as
      `LIGHTFRAME_DATA_DIR`.
- [ ] Verify the resolved leaf is exactly one participant-specific child of the reviewed pilot
      root, is not a symbolic link, and contains no other participant data.
- [ ] Start Studio with `PILOT_ACCESS_MODE=participant`. If the selected provider is Wiro, verify
      image generation reports unavailable. Wiro requires a separate
      `PILOT_ACCESS_MODE=operator-qualification` technical pass with no participant present.
- [ ] Confirm Local Camera, upload-only, direct character save, prompt editing, and local Voice
      remain usable without provider credentials or external traffic.

## At final engagement, withdrawal, or cancellation

- [ ] Record the retirement deadline: within 24 hours of this event and no later than day eight
      after the first session.
- [ ] Stop recording and AI work, close Studio, stop the API, and verify camera, microphone,
      WebRTC, and provider activity ended.
- [ ] Clear site data and permissions for the exact loopback origin in the dedicated browser
      profile: localStorage, IndexedDB, Cache Storage, service-worker data, and permissions.
- [ ] Remove the dedicated browser profile through browser controls.
- [ ] Re-resolve and compare the participant leaf and reviewed pilot root. Stop if either differs
      from the pre-session record, the leaf is missing or shared, or the target is not exactly one
      child below the root.
- [ ] Move only the exact participant leaf to the operating-system Trash. Do not recursively
      remove it from a shell and do not target the shared root.
- [ ] Start the API against a new empty disposable directory and verify former participant asset
      IDs return the safe not-found response.
- [ ] Reconcile Wiro `InputOutputDelete` outcomes and provider account controls for other
      provider-managed disposable artifacts. Any cleanup warning fails this retirement.
- [ ] Verify the shared pilot root and every unrelated participant leaf remain present.
- [ ] Evidence Recorder and Support & Escalation Owner initial the content-free record.
- [ ] Permanently empty only the specifically reviewed trashed participant leaf.
- [ ] Retain only aggregated, content-free counts. Remove the participant-code row at cohort close.

## Content-free evidence record

| Field                                               | Value                         |
| --------------------------------------------------- | ----------------------------- |
| Anonymous participant code                          |                               |
| First session date                                  |                               |
| Final engagement/withdrawal/cancellation time       |                               |
| Required cleanup deadline                           |                               |
| Exact loopback origin                               |                               |
| Reviewed pilot root proof                           | Pass / Fail                   |
| Exact participant leaf proof                        | Pass / Fail                   |
| Browser site/profile retirement                     | Pass / Fail                   |
| Former asset ID not found against empty environment | Pass / Fail                   |
| Provider cleanup reconciliation                     | Pass / Fail / Not applicable  |
| Shared-root and unrelated-leaf preservation         | Pass / Fail                   |
| Evidence Recorder initials and time                 |                               |
| Support & Escalation Owner initials and time        |                               |
| Final outcome                                       | Pass / Block next participant |

Run `npm run pilot:data-retirement:drill` before the first participant and after changing this
procedure. The drill uses disposable temporary data, retires one exact leaf, proves a sibling and
shared-root sentinel survive, verifies the retired path is inaccessible, and cleans up only its
own generated temporary root.
