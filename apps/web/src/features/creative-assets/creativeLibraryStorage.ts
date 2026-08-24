import type { CreativeAssetStore } from '@studio/domain';
import type { CreativeLibraryMirror } from './useCreativeLibraryCloudSync';

/**
 * What the operator is told about where this library lives.
 *
 * None of the three answers claims account persistence that the deployment may not have: the
 * owner-scoped routes are registered only in relational database modes. Production requires Neon;
 * local mode remains a development fallback and is stated as unavailable account sync, not as a
 * second product storage model.
 */
const STORAGE_SUMMARIES: Readonly<Record<CreativeLibraryMirror, string>> = {
  checking: 'Checking your account library…',
  'browser-only': 'Account sync is unavailable in this configuration.',
  cloud: 'Available wherever you sign in.',
};

const STORAGE_DETAILS: Readonly<Record<CreativeLibraryMirror, string>> = {
  checking:
    'Lightframe is checking whether this account can store Characters, Outfits, wardrobe variants and saved prompts on the server.',
  'browser-only':
    'Account sync is unavailable in this configuration. Export a backup before clearing local site data.',
  cloud:
    'Characters, Outfits, wardrobe variants and saved prompts are saved to your Lightframe account and available wherever you sign in.',
};

/** The reference images live outside the file in every mode, so this line never varies. */
export const CREATIVE_LIBRARY_EXPORT_CONTENTS_NOTE =
  'An exported file lists the reference images each record uses, but never contains the images themselves.';

/** The compact account-availability statement shown above Characters and Outfits. */
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
