/**
 * How a Project names a piece of media it holds: a retained byte asset of its own, or the exact
 * immutable Library Version it borrows. A leaf file on purpose — the snapshot and the composition
 * both import it, and the module graph refuses a cycle between the two.
 */
export type ProjectMediaReference =
  | { readonly kind: 'asset'; readonly assetId: string }
  | {
      readonly kind: 'saved-video-version';
      readonly savedVideoId: string;
      readonly videoVersionId: string;
    };
