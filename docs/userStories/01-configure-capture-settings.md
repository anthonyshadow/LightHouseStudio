# Configure capture settings

## User story

As a creator, I want to choose the camera, microphone, and local quality target for this tab before capture begins, so that the next preview uses the right equipment without an accidental permission request.

## Starting state

- The studio is open on `localhost` or HTTPS in a browser with media-device support.
- No take is recording or under review. AI is not connecting or live.
- The creator may be in Local Camera, Character AI, or Virtual Try-On mode.

## End-to-end steps

1. Locate the capture controls below the stage and select **Device settings** (accessible name: **Open capture settings**).
2. Read the panel description: device discovery is session-only and does not start camera or microphone capture.
3. Wait for the initial device scan, or select **Refresh** to scan again. The browser may show
   generic labels until a prior camera permission exists. Opening the panel does not request it.
4. In **Camera**, keep **Default camera** or choose any camera exposed by the browser. This can
   include the built-in camera, Apple Continuity Camera/iPhone, USB or virtual cameras, and
   phone-webcam devices supplied by another operating system.
5. In **Microphone**, keep **Default microphone** or choose a specific available microphone. This microphone supplies local capture and can be the fallback audio source for AI output.
6. If Local Camera is selected, choose `720p · 30 fps` or `1080p · 30 fps`. If an AI mode is selected, note that the model controls resolution while the selected devices still apply.
7. Review **Active capture**. Before a preview it says Not started; after a preview it reports negotiated camera, microphone, and resolution.
8. Select **Apply settings**.
9. If no preview is running, the choices will be used only on the next explicit camera start. If a
   Local Camera preview is running, the settings panel remains open: wait for the replacement
   stream to become healthy and appear on the persistent stage before the prior stream is released.
10. Leave the panel open while connecting or disconnecting a device. The list refreshes on the
    browser `devicechange` event; **Refresh** remains available for browser/OS discovery delays.
    A newly appearing phone is never selected automatically.

The live-stage mic and camera on/off controls affect the current session
immediately. They are separate from Capture Settings, which owns source/profile
selection and atomic stream replacement.

## Failure and alternate paths

- **Discard** restores the previously applied settings and leaves active capture unchanged.
- If a selected camera disappears, it stays visible as “Selected camera (unavailable).” A
  dismissible notice explains that the browser default will be used on the next explicit start.
  The in-memory preference is retained so the camera can be chosen again after reconnection.
- If the browser reports no camera or denied permission, the Camera section names the state and
  keeps permission requests behind the explicit Start action.
- If a live local replacement cannot be acquired, the current preview remains active and the panel reports **Settings unchanged**.
- During recording, take review, or an active AI lifecycle, the controls explain why settings are unavailable instead of applying a partial change.

## Completion criteria

The desired device/profile is either staged for the next explicit start or is confirmed in **Active capture**. No provider was contacted and no device ID was persisted in Recipe Shelf/browser storage.

## UX investigation cues

- Count the choices required before the creator feels confident that the intended device is selected.
- Observe whether generic device labels or the difference between requested and negotiated resolution creates hesitation.
- Measure whether the blocked-state explanations are discovered before a creator tries to change settings mid-session.
