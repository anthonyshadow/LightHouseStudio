import { requireOpaqueId } from '../common/identity';

/**
 * How a Project names a piece of media it holds: a retained byte asset of its own, or the exact
 * immutable Library Version it borrows. A leaf file on purpose — the snapshot and the composition
 * both import it, and the module graph refuses a cycle between the two — so the rule about what
 * makes a reference valid lives here too, with the type it describes.
 */
export type ProjectMediaReference =
  | { readonly kind: 'asset'; readonly assetId: string }
  | {
      readonly kind: 'saved-video-version';
      readonly savedVideoId: string;
      readonly videoVersionId: string;
    };

/**
 * The ids a reference must name, each a durable app-owned identifier rather than a browser locator.
 * It takes the thrower rather than owning one, the way `requireOpaqueId` does: the *policy* is
 * shared, and each aggregate keeps its own error taxonomy. `labelPrefix` names the thing being
 * validated so a failure says which reference was wrong.
 */
export const requireMediaReferenceIds = (
  reference: ProjectMediaReference,
  labelPrefix: string,
  onInvalid: (message: string) => never,
): void => {
  if (reference.kind === 'asset') {
    requireOpaqueId(reference.assetId, `${labelPrefix} asset`, onInvalid);
    return;
  }
  requireOpaqueId(reference.savedVideoId, `${labelPrefix} Saved Video`, onInvalid);
  requireOpaqueId(reference.videoVersionId, `${labelPrefix} Video Version`, onInvalid);
};
