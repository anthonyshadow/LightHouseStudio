# Configure capture settings

**Outcome:** choose session-only camera, microphone, local video format, and quality preferences
without starting media or contacting a provider.

## Journey

1. On a large desktop, the settings rest collapsed beside the stage: the column keeps the current
   camera and microphone, any blocked or missing camera, and a **Capture settings** control that
   opens the panel in place. On tablet and mobile, open **Device settings**
   (**Open capture settings**) to use the same controller in a compact overlay.
2. Wait for automatic device discovery. Listing devices does not request permission; labels may
   stay generic until a later explicit camera start. Studio rescans after a successful Start and
   when the browser reports `devicechange`.
3. Choose a camera and microphone. In Local Camera, use the always-visible **Video format** choices
   to switch between **Landscape · 16:9** and **Portrait · 9:16**, then choose `720p · 30 fps` or,
   when supported, `1080p · 30 fps`. A new phone or tablet session defaults to portrait; a new
   desktop session defaults to landscape. The explicit session choice remains selected if the
   viewport later changes. Camera, microphone, and quality use the shared custom chooser: an
   anchored listbox on larger viewports and a safe-area-aware bottom sheet on phones. Arrow keys,
   Home/End, typeahead, Escape, pointer, and touch all operate the same controlled value. AI modes
   use provider-required dimensions.
4. Change a setting. Studio applies it automatically. With no preview, the choice applies to the
   next Start. During a ready local preview, Studio commits a healthy replacement before releasing
   the old stream; a failed replacement restores the applied choice and reports **Settings
   unchanged**.
5. Confirm the negotiated sources and resolution under **Active capture**. Device discovery runs
   when the settings surface mounts and again on browser `devicechange`; there are no Apply,
   Refresh, or Discard actions. The stage uses the applied format, and the recorder borrows that
   same camera track. Collapsing the desktop panel hides it without unmounting it, so discovery and
   an in-flight automatic apply are unaffected, and no draft choice is lost.

The list refreshes on `devicechange` and after a successful Start. Studio never auto-selects a
newly attached phone. During an eligible local preview, the stage exposes **Switch camera** only
for browser-reported front/rear modes and hardware zoom only when the track reports zoom support.

## Guards and recovery

- A blocked or missing camera stays on the surface while the desktop panel is collapsed; the
  collapsed column repeats the same titles the open panel explains in full.
- If a selected device disappears, Studio retains the choice, explains that the browser default
  will be used, and allows reselection after reconnection.
- A failed live replacement leaves the current preview active and reports **Settings unchanged**.
- If a camera cannot satisfy the selected aspect ratio, Start or automatic live replacement fails
  safely instead of silently recording the previous format. Active capture reports the
  browser-negotiated result.
- Settings are disabled during AI start/live, recording/finalization, and take review. They can
  still be opened and read while disabled, and say why they are unavailable.
- A session error that points at capture settings opens the desktop panel and moves focus to it.
- Preferences are in-memory for the tab; device IDs are not written to creative-library storage.
- In an open Project, **Save progress** may checkpoint only the applied format class and
  app-owned audio-source mode as live metadata. It never stores device IDs, starts media, or writes
  per-control changes; Capture Settings keeps its existing session owner.

## Evidence status

Aspect-ratio constraint selection, stage framing, atomic replacement, post-permission refresh,
unavailable-device fallback, front/rear switching, and zoom gating have automated coverage.
Physical camera discovery, portrait negotiation, and controls remain part of
[manual release validation](../../MANUAL_QA.md).
