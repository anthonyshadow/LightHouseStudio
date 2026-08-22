import type { AssetDestination } from '../../app/paths';

/**
 * What each asset library is, in one sentence.
 *
 * One owner for the Assets hub cards and the library overlays, so the two surfaces cannot describe
 * the same library differently — they already had, and the drift is how a provider model name
 * ("Lucy 2.5") reached the Characters overlay while the hub said something else entirely.
 *
 * These describe capabilities, so they name no provider and no model. Naming a configured
 * integration in the availability panel is a different job and stays where it is.
 */
export const ASSET_LIBRARY_DESCRIPTIONS: Readonly<Record<AssetDestination, string>> = {
  videos: 'Preview, edit, download, rename or remove your videos, and open any saved version.',
  characters: 'Reusable characters you can apply to any video, with their saved wardrobe variants.',
  outfits: 'Saved Virtual Try-On outfits you can reuse in new or existing video work.',
  voices: 'Preview the catalog, keep the voices you want, and send one to Studio.',
};
