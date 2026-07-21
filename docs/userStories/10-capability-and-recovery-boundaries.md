# Capability and recovery boundaries

## User story

As a creator, I want to understand what is available and how to recover from unavailable features, so that I can continue local creative work without guessing which provider or browser dependency failed.

## Starting state

- The creator opens the studio in a supported or partially supported environment.
- Optional Decart, OpenAI, and ElevenLabs credentials may or may not be configured.

## End-to-end steps

1. On startup, read the **Integration availability** strip. It comes from the loopback `/api/capabilities` check and does not contact Decart or ElevenLabs.
2. If Local Camera is available, prepare prompts, manage the Recipe Shelf, stage capture settings, preview/record locally, and use local voice processing without provider credentials.
3. If AI video is available, use the Character AI or Virtual Try-On workflows. If unavailable, use local preparation/capture and read the availability explanation rather than attempting to start AI.
4. If reference generation is available, open the Workshop and follow the explicit optimization/generation steps. If unavailable, still build, save, and use text-only character prompts.
5. If ElevenLabs is available, complete a take then open the explicit voice-browser disclosure. If unavailable, use Original/local treatments where browser support allows.
6. When the integration broker cannot be reached, use the stage notice’s **Retry check** action. Local preparation remains possible, but provider availability cannot be reliably shown until it succeeds.
7. When a camera/device error occurs, read the stage notice and choose **Capture settings** or resolve browser permission/device state before retrying Start.
8. When a generated reference cannot be restored, decide between **Retry** and **Continue without reference**. When a voice/recording operation fails, preserve/review the current original take before trying again.

## What never happens automatically

- Editing prompts, opening overlays, browsing the Shelf, or listing capture devices does not request camera access or trigger provider work.
- Selecting Local Camera never requests a Decart credential or connection.
- Opening voice treatments never fetches voices; the explicit Browse action is the provider boundary.
- Failed processing, reference generation, or provider output never silently replaces a valid current artifact with an invalid one.

## Failure and alternate paths

- If the local capability check fails, select **Retry check**. Continue local preparation while availability remains unknown.
- If browser device access fails, use the stage notice to open **Capture settings**, resolve the named issue, then retry the explicit start action.
- If a provider capability is absent, use the related local/text-only alternative rather than expecting another configured provider to enable it.
- If a stored reference, recording treatment, or provider conversion fails, retry the named operation or retain the existing text/original artifact; the app does not silently replace it.

## Completion criteria

The creator proceeds through the available local path or uses the named recovery action, with a clear understanding that optional integrations degrade independently.

## UX investigation cues

- Whether availability is noticed early enough to prevent an attempted unavailable flow.
- Whether recovery messages name an action the creator can actually take.
- Whether independent degradation is comprehensible, especially when one provider works and another does not.
