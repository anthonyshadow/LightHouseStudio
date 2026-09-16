import type { ProjectSourceCollectionItem } from '@studio/contracts';
import { projectMediaReferenceKey, type ProjectMediaReference } from '@studio/domain';
import { currentCutOf, type CurrentCut } from './useProjectCurrentCut';

/**
 * Where a clip's media actually is, for the surface that has to play and measure it.
 *
 * A clip names media by reference; playing it needs a URL and a frame. `CurrentCut` already carries
 * exactly that pair and is already what the save step and the placement chooser read, so the
 * arrangement reuses it rather than minting a second word for one idea.
 */
export type ProjectClipMedia = CurrentCut;

/**
 * The reference a held source answers to.
 *
 * The same derivation `describeCurrentCut` makes, and deliberately the same shape: a source that
 * borrows a Library Version is addressed as that Version wherever it appears, because that is what
 * the Project stored and what a clip over it will name.
 */
export const projectSourceReference = (
  source: ProjectSourceCollectionItem,
): ProjectMediaReference =>
  source.savedVideoId !== null && source.videoVersionId !== null
    ? {
        kind: 'saved-video-version',
        savedVideoId: source.savedVideoId,
        videoVersionId: source.videoVersionId,
      }
    : { kind: 'asset', assetId: source.assetId };

/**
 * One piece of media the Project holds, as a clip would name it and as a player would open it.
 *
 * Both halves travel together because the arrangement needs both at once: a clip is *added* by
 * reference and *shown* by URL, and a catalogue that kept only the media would leave the surface
 * parsing its own keys back into references to offer them.
 */
export interface ProjectClipMediaEntry {
  readonly reference: ProjectMediaReference;
  readonly media: ProjectClipMedia;
}

/**
 * Everything a clip may stand over, keyed for lookup and kept in the order the Project lists it.
 *
 * Two inputs, because a Project's media has two homes and the collection only knows one of them.
 * Every source it holds is in the catalogue; the cut the revision presents is added beside them
 * because an arrangement is seeded over exactly that media — a render or an adopted result the
 * source list has never held. Media a clip names and neither input explains is media this browser
 * cannot play, and the surface says so rather than guessing.
 */
export type ProjectClipMediaCatalogue = ReadonlyMap<string, ProjectClipMediaEntry>;

export const projectClipMediaCatalogue = (
  sources: readonly ProjectSourceCollectionItem[],
  presented: { readonly reference: ProjectMediaReference | null; readonly cut: CurrentCut | null },
): ProjectClipMediaCatalogue => {
  const catalogue = new Map<string, ProjectClipMediaEntry>();
  for (const source of sources) {
    const reference = projectSourceReference(source);
    catalogue.set(projectMediaReferenceKey(reference), { reference, media: currentCutOf(source) });
  }
  // Last, so the presented cut wins where it is also a held source: same media, and the cut is the
  // description the stage is already using. A `Map` keeps the position of a key it already holds,
  // so the collection's order survives and only a cut the collection never held is appended.
  if (presented.reference !== null && presented.cut !== null) {
    // Set as it came: it is already the cut's own projection, and re-making it would hand the
    // surface a copy that compares unequal to the one the cache holds.
    catalogue.set(projectMediaReferenceKey(presented.reference), {
      reference: presented.reference,
      media: presented.cut,
    });
  }
  return catalogue;
};

/** The media a clip stands over, or `null` when this browser cannot address it. */
export const clipMediaOf = (
  catalogue: ProjectClipMediaCatalogue,
  reference: ProjectMediaReference,
): ProjectClipMedia | null => catalogue.get(projectMediaReferenceKey(reference))?.media ?? null;
