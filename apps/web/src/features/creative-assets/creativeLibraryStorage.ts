import type { CreativeAssetStore } from '@studio/domain';
import type { CreativeLibraryMirror } from './useCreativeLibraryCloudSync';

/**
 * What the operator is told about where this library lives.
 *
 * One owner for both the hub cards and the library surfaces, so the two can never disagree, and
 * none of the three answers claims a cloud copy that the deployment may not have: the routes are
 * registered only in the relational database modes, and `DATABASE_MODE` defaults to `local`.
 */
const STORAGE_SUMMARIES: Readonly<Record<CreativeLibraryMirror, string>> = {
  checking: 'Stored in this browser.',
  'browser-only': 'Stored in this browser only — clearing site data deletes it.',
  cloud: 'Stored in this browser and copied to your account.',
};

const STORAGE_DETAILS: Readonly<Record<CreativeLibraryMirror, string>> = {
  checking:
    'Characters, Outfits, wardrobe variants and saved prompts are stored in this browser. Whether this account also keeps a copy on the server has not been confirmed.',
  'browser-only':
    'Characters, Outfits, wardrobe variants and saved prompts are stored in this browser only. Clearing site data for this browser deletes them, and there is no copy anywhere else.',
  cloud:
    'Characters, Outfits, wardrobe variants and saved prompts are stored in this browser and copied to your account on the server.',
};

/** The reference images live outside the file in every mode, so this line never varies. */
export const CREATIVE_LIBRARY_EXPORT_CONTENTS_NOTE =
  'An exported file lists the reference images each record uses, but never contains the images themselves.';

/** One short line for a hub card. */
export const creativeLibraryStorageSummary = (mirror: CreativeLibraryMirror): string =>
  STORAGE_SUMMARIES[mirror];

/** The fuller statement for the surface where the library is managed. */
export const creativeLibraryStorageDetail = (mirror: CreativeLibraryMirror): string =>
  STORAGE_DETAILS[mirror];

const quantity = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

const sentenceList = (parts: readonly string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** What a store holds, for a confirmation that has to say what is being replaced. */
export const describeCreativeLibraryContents = (store: CreativeAssetStore): string =>
  sentenceList([
    quantity(store.savedCharacterPrompts.length, 'character', 'characters'),
    quantity(store.savedCharacterVariants.length, 'wardrobe variant', 'wardrobe variants'),
    quantity(store.savedPrompts.length, 'saved outfit or prompt', 'saved outfits and prompts'),
    quantity(store.recentPrompts.length, 'recent prompt', 'recent prompts'),
  ]);
