# Controlled-pilot release contract

**Status:** Product-owner approved on 2026-07-28

**Scope:** Local, single-operator, loopback-only design-partner pilot

**Implementation state:** Target contract; not a claim that the current runtime or physical matrix
has passed qualification

This contract freezes the product and operating decisions required before the remaining local
implementation waves. Current behavior remains defined by the code, [architecture](ARCHITECTURE.md),
and [observable user stories](userStories/README.md). A target below is unsupported until its
automated, physical-device, accessibility, memory, cleanup, and live-provider evidence passes.

## Pilot promise and cohort

- The pilot promise is short-form solo Character Performance: local preview → reusable Character
  → Lucy 2.5 → Record → optional Voice → Download.
- Virtual Try-On is a named secondary beta. Workshop is an advanced supporting tool.
- The cohort is at most five invited, technically comfortable solo creators, creative
  technologists, or design partners.
- Every participant session is scheduled and operator-assisted from setup through cleanup. No
  unassisted local-beta step is approved in this release contract.
- The operator admits one participant environment at a time. Participants do not receive
  credentials, shell access, shared ingress, or unsupervised access to provider-funded actions.
- The broker remains bound to loopback. LAN access, tunnels, proxies, public hostnames, shared
  servers, accounts, billing, and cloud persistence are outside this pilot.

## Qualification matrix

### Version policy

The matrix snapshot was selected on 2026-07-28. Apple lists iOS/iPadOS 26.6 and Safari 26.6 as the
current stable releases, and Android 17 is the current stable Android platform release. Browser
qualification uses the latest generally available stable patch on the day evidence is recorded,
never beta, developer, nightly, or early-stable-only builds. The evidence record must contain the
exact installed version.

If a named OEM has not released a stable Android 17 build for a target, test that device on its
latest vendor-stable release but leave the Android 17 support row blocked. A Google Pixel reference
target must independently pass Android 17. A browser or OS release after this snapshot does not
inherit support: re-run the affected physical protocol before changing the published claim.

### Desktop target

| Device                                                     | OS         | Browsers                                                                                    | Qualification status                       |
| ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Apple MacBook Pro 14-inch (2021, M1 Pro; `MacBookPro18,3`) | macOS 26.6 | Safari 26.6; Chrome 150.0.7871.187 or newer stable patch in major 150; Firefox 153.x stable | Target selected; physical protocol pending |

The desktop browser set is Chrome, Firefox, and Safari. Edge is not part of this pilot contract.

### Apple phone targets

Every row uses iOS 26.6 and must pass Safari 26.6, Chrome for iOS 151.x stable, and Firefox for iOS
153.x stable. Apple mobile browsers share the system WebKit engine, but each browser application
still needs its own permission, viewport, download, background/foreground, and recovery pass.

| Physical target   | OS       | Qualification status              |
| ----------------- | -------- | --------------------------------- |
| iPhone 17         | iOS 26.6 | Target selected; evidence pending |
| iPhone 17 Pro     | iOS 26.6 | Target selected; evidence pending |
| iPhone 17 Pro Max | iOS 26.6 | Target selected; evidence pending |
| iPhone 16         | iOS 26.6 | Target selected; evidence pending |
| iPhone 16 Pro Max | iOS 26.6 | Target selected; evidence pending |

### Android phone targets

The five popularity-led targets cover the current high-volume Galaxy A and Redmi families.
Google Pixel 10 is an additional latest-platform sentinel so Android 17 can be qualified without
waiting for every OEM rollout. Each Android target must pass Chrome 150.x stable or the later
generally available stable major installed on the evidence date, plus Firefox 153.x stable.
Safari is not available on Android and is therefore not an Android test requirement.

| Physical target                   | Required OS condition                                                        | Qualification status              |
| --------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Samsung Galaxy A07 4G             | Latest vendor-stable release; Android 17 row remains blocked until available | Target selected; evidence pending |
| Samsung Galaxy A16 5G             | Latest vendor-stable release; Android 17 row remains blocked until available | Target selected; evidence pending |
| Samsung Galaxy A56 5G             | Latest vendor-stable release; Android 17 row remains blocked until available | Target selected; evidence pending |
| Samsung Galaxy A36 5G             | Latest vendor-stable release; Android 17 row remains blocked until available | Target selected; evidence pending |
| Xiaomi Redmi A5                   | Latest vendor-stable release; Android 17 row remains blocked until available | Target selected; evidence pending |
| Google Pixel 10 platform sentinel | Android 17, current stable patch                                             | Target selected; evidence pending |

### Tablet targets

The five popularity-led targets cover the leading Apple and Samsung volume families. Google Pixel
Tablet is an additional Android 17 large-screen sentinel. Apple rows must pass Safari, Chrome, and
Firefox. Android rows must pass Chrome and Firefox; Safari is not available on Android.

| Physical target             | Required OS condition                                                | Browsers                                                 | Qualification status              |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------- |
| Apple iPad (A16)            | iPadOS 26.6                                                          | Safari 26.6; Chrome for iOS 151.x; Firefox for iOS 153.x | Target selected; evidence pending |
| Apple iPad Air 11-inch (M3) | iPadOS 26.6                                                          | Safari 26.6; Chrome for iOS 151.x; Firefox for iOS 153.x | Target selected; evidence pending |
| Apple iPad Pro 11-inch (M5) | iPadOS 26.6                                                          | Safari 26.6; Chrome for iOS 151.x; Firefox for iOS 153.x | Target selected; evidence pending |
| Samsung Galaxy Tab A9+      | Latest vendor-stable release; Android 17 row blocked until available | Chrome and Firefox latest stable                         | Target selected; evidence pending |
| Samsung Galaxy Tab S10 FE   | Latest vendor-stable release; Android 17 row blocked until available | Chrome and Firefox latest stable                         | Target selected; evidence pending |
| Google Pixel Tablet         | Android 17, current stable patch                                     | Chrome and Firefox latest stable                         | Target selected; evidence pending |

The popularity basis is the latest available global handset sales and tablet vendor data, not a
permanent claim that these models will remain the most used. Revisit the model list before each
release candidate rather than silently substituting a device:

- [Counterpoint global smartphone model sales, Q1 2026](https://counterpointresearch.com/en/insights/iphone-17-global-best-selling-smartphone-in-q1-2026-top-10-take-25-percent-share)
- [IDC worldwide tablet shipments, 2025](https://www.idc.com/resource-center/blog/global-tablet-shipments-rise-1-9-in-4q25-as-seasonal-demand-offsets-cooling-replacement-cycle/)
- [Apple security releases](https://support.apple.com/en-ca/100100)
- [Android 17 release](https://developer.android.com/blog/posts/android-17-is-here)
- [Chrome releases](https://chromereleases.googleblog.com/)
- [Mozilla Firefox security advisories](https://www.mozilla.org/en-US/security/known-vulnerabilities/firefox/)

## Independent five-minute boundaries

The recording limit and Decart active-session limit are separate app-owned contracts even though
both are 300 seconds.

### Recording

- The supported take maximum is 300 seconds.
- At 270 seconds, show a persistent in-stage warning with 30 seconds remaining, announce it through
  an accessible status region, and keep **Stop recording** visible and operable.
- Continue showing remaining time without moving or resizing the stage.
- At 300 seconds, invoke the existing coalesced Stop/finalize path exactly once.
- Final recorder data and the optional audio sidecar settle before any owned local/provider
  resource is released.
- Playback, Voice, Download, Close, and confirmed Discard remain available. The review state
  explains that recording ended at the supported maximum.

### Decart active session

- Every direct Character or VTO Start surface states the 300-second maximum before provider
  contact.
- At 270 active seconds, show a persistent in-stage warning and accessible remaining-time status
  without displacing Record or Stop.
- Expected completion at 300 seconds is not an error. Preserve the recipe, return to local preview,
  and offer an explicit new Start when resources have settled.
- If the provider boundary arrives while recording, coalesce through recording finalization and do
  not release the provider/local sources until final recorder data and the optional sidecar settle.
- Unexpected disconnect, permission, quota, entitlement, and provider failures remain distinct
  safe recovery classes.

## Participant data promise

- Each participant receives a fresh browser profile and a dedicated, explicitly resolved
  `LIGHTFRAME_DATA_DIR`. Participant environments are never reused or shared.
- The operator may retain the isolated local dataset only through the participant's scheduled
  engagement, including one planned seven-day return session.
- The whole local dataset is retired within 24 hours after the final scheduled session, withdrawal,
  or cancellation, and no later than eight days after the first session.
- **Remove**, **Detach**, draft reset, character deletion, or relation cleanup does not mean that
  immutable reference bytes were deleted. Only the whole-environment retirement procedure makes
  that local deletion promise.
- The current Studio take remains temporary browser memory. Download is the participant's durable
  handoff; downloaded participant copies are outside the operator's Lightframe dataset.
- Participant prompts, images, audio, video, provider payloads, device identifiers, and credentials
  are excluded from evidence records. After local cleanup, retain only aggregated content-free
  counts with no participant lookup key.
- Provider-side retention follows the exact reviewed account setting and current provider terms.
  It is disclosed before contact and is not represented as local deletion. Wiro's automated
  input/output cleanup must succeed or be recorded as a failed technical qualification.

## Isolated environment and verified cleanup

Before a session:

1. Create a random participant code that contains no name, email, or device identifier.
2. Create a fresh browser profile for that code.
3. Resolve a new explicit absolute directory under the operator-controlled pilot root and set that
   exact leaf as `LIGHTFRAME_DATA_DIR`.
4. Confirm the directory is not shared, does not contain another participant's files, and is not a
   repository, home directory, cloud-synced folder, or provider credential location.
5. Record only the participant code, session dates, and cleanup deadline in the private operator
   checklist.

At retirement:

1. Stop recording/session work, close the Studio tab, stop the API, and verify camera, microphone,
   WebRTC, and provider activity are gone.
2. Clear site data for the exact loopback origin in the dedicated browser profile, including
   localStorage, IndexedDB, Cache Storage, service-worker data, and permissions.
3. Remove the dedicated browser profile through the browser's profile controls.
4. Move the exact participant `LIGHTFRAME_DATA_DIR` leaf to the operating-system Trash. Never use a
   recursive command against an unresolved variable, shared root, home directory, or broad glob.
5. Restart against an empty disposable data directory and verify that retained participant asset
   IDs cannot be resolved.
6. Verify Wiro cleanup outcomes and use provider account controls for any provider-managed
   disposable artifacts. Remove local keys when the qualification pass is finished.
7. Have the Evidence Recorder and Support & Escalation Owner initial the content-free checklist,
   then permanently empty the specifically reviewed trashed participant leaf.

Cleanup fails closed: any missing path proof, shared-profile ambiguity, provider cleanup warning,
or unexplained retained relationship blocks the next participant.

## Approved provider configurations

All permanent credentials remain server-side, least-privilege, and operator-owned. OpenAI, BFL,
and Wiro are separate startup-selected passes with no fallback and no automatic retry of the
initial billable submission.

| Provider         | Approved local-pilot configuration                                                                                        | Participant rule                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Decart Character | Exact `lucy-2.5`; origin/model-scoped client token; 300-second active-session maximum                                     | Allowed only after direct disclosure and live qualification                                              |
| Decart VTO       | Exact pinned `lucy-vton-3`; no moving alias                                                                               | Named beta; one garment/plain background guidance; no fit, sizing, or purchase-accuracy claim            |
| OpenAI optimizer | `gpt-5.6`, `medium` reasoning, `lucy-character-reference-v1`, 120-second timeout, response storage disabled               | Allowed after explicit Optimize/Generate intent and account-term review                                  |
| OpenAI image     | `gpt-image-2`, `high`, one result, 150-second timeout, zero SDK retries                                                   | Allowed after explicit Generate/Regenerate/Compose intent                                                |
| BFL image        | `flux-2-pro`, safety tolerance `2`, prompt upsampling disabled, one 150-second submit/poll/download deadline              | Allowed after separate live qualification; no fallback or automatic resubmission                         |
| Wiro image       | `seedream-v5-lite-uncensored`, one `2k` result, watermark disabled, one 180-second deadline, required `InputOutputDelete` | Technical/operator qualification only; unavailable to external participants under this contract          |
| ElevenLabs       | Saved voices only; `eleven_multilingual_sts_v2`; `ELEVENLABS_ENABLE_LOGGING=false`; restricted key                        | Participant use requires confirmed zero-retention eligibility; otherwise cloud conversion is unavailable |

If a provider/model, retention term, safety setting, entitlement, or account capability differs
from this table, stop the pass. Do not silently substitute a model, enable logging, loosen a safety
setting, follow an alias, retry a paid submission, or fall back to another provider.

## Participant content, refusal, and support policy

Participants must be adults and must have the right and consent to use every submitted face,
voice, garment, prompt, and reference. The operator refuses or stops:

- minors or age-ambiguous subjects;
- nudity, sexual or exploitative content;
- deceptive impersonation, fraud, or non-consensual face/voice use;
- hateful, harassing, violent, illegal, or self-harm-promoting content;
- attempts to bypass provider safety controls or use Wiro's uncensored configuration; and
- content whose ownership or consent cannot be established for the moderated session.

Provider refusal is final for that request. The operator does not rephrase a rejected request to
evade controls and does not switch providers to obtain a disallowed result. A safe refusal does not
promise that a paid provider request was free; the Billing Authorizer reviews the provider record.

## Generic local-phase owners

These generic role names are approved for the local phase:

| Role                       | Responsibility                                                                  |
| -------------------------- | ------------------------------------------------------------------------------- |
| Pilot Product Owner        | Owns cohort, release scope, policy approval, and go/no-go                       |
| Credential Custodian       | Creates, scopes, stores, rotates, and removes provider credentials              |
| Billing Authorizer         | Approves each paid pass and reviews quota/cost outcomes                         |
| Evidence Recorder          | Maintains the content-free qualification and cleanup record                     |
| Support & Escalation Owner | Moderates sessions, stops unsafe work, coordinates recovery, and owns incidents |

One local operator may hold multiple roles, but every live pass records which generic role
authorized and witnessed it. Generic roles are not accounts, authentication identities, or a
substitute for named operational ownership in a future remote product. Personal assignments must
be revisited before moving beyond local-only operation.

## Operator limits

- At most five invited participants and one active participant environment at a time.
- At most 30 cumulative Decart connected minutes per participant across Character and VTO.
- At most 10 billable image preview/generation/edit/composition submissions per participant across
  all separately selected image-provider passes.
- At most three ElevenLabs conversion submissions per participant.
- Stop a provider path after two failed requests that may have incurred cost. Do not retry it in
  that participant session.
- No automatic retry of an initial billable submission and no provider fallback.
- Provider-funded access exists only while the operator is present and the Billing Authorizer has
  approved the pass.

These are operator-enforced pilot limits, not app entitlements or billing truth. Provider account
budgets must be lower than the approved pilot budget where the provider supports them.

## Content-free metrics

Use the hypotheses and denominators in [Product state](product-state.md#17-recommended-success-metrics).
The Evidence Recorder may capture only:

- anonymous session outcome and elapsed time to local preview, Character Start, review, and
  Download;
- safe provider/model identifier, connected seconds, expected expiry, and safe outcome class;
- generation/conversion attempt count, input duration where applicable, and success/failure class;
- recording stop/finalization/download success and whether an immutable original survived;
- participant answers about disclosure, detach-versus-delete, and Download; and
- operator support minutes.

Do not capture content, raw errors, provider payloads, URLs, credentials, device identifiers, or
network archives. Aggregate the metrics at cohort close and delete row-level participant codes with
the isolated environment.

## Support and escalation

The Support & Escalation Owner remains present throughout every participant session.

1. Preserve local preview, the prepared recipe, and the last valid take where possible.
2. Stop after an unexpected provider charge class, repeated paid failure, unsafe output, policy
   refusal, unexplained external request, data-isolation doubt, or cleanup failure.
3. Record only the safe app-owned code, provider/model ID, action time, and outcome class.
4. Credential or suspected data exposure ends the session immediately: stop the API, revoke the
   affected key, isolate the participant environment, and begin verified retirement.
5. Billing disputes go to the Billing Authorizer; credential incidents go to the Credential
   Custodian; release/data/support incidents go to the Pilot Product Owner and Support &
   Escalation Owner.
6. Resume only after the responsible role records a safe disposition. Never weaken origin,
   validation, intent, retention, cleanup, model-pin, or no-fallback boundaries to recover a pass.

## Release effect

Wave 0 is complete because the cohort, matrix, thresholds, retention promise, cleanup procedure,
provider configurations, content policy, role ownership, operator limits, metrics, and escalation
path are approved and recorded.

This does not close the implementation or evidence findings. In particular, touch recovery,
narrow-screen usability, direct disclosures, capability truth, the two independent time
boundaries, data-lifecycle UI, full physical-device passes, memory measurements, accessibility,
and live provider qualification remain release gates in later waves.
