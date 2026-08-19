import {
  CREATIVE_LIBRARY_EXPORT_MAX_BYTES,
  createCreativeLibraryExportFile,
  parseCreativeLibraryExportFile,
  type CreativeAssetStore,
  type CreativeLibraryExportFile,
  type CreativeLibraryImportRefusal,
} from '@studio/domain';

/**
 * Why a file was refused, said in the operator's terms.
 *
 * The domain returns a reason code and nothing else, so the copy has one owner here and the rule
 * has one owner there. Every message ends by saying the library was left alone, because a refusal
 * that does not say so reads like a partial import.
 */
const REFUSAL_MESSAGES: Readonly<Record<CreativeLibraryImportRefusal, string>> = {
  'too-large': 'That file is too large to be a creative library export. Your library is unchanged.',
  unreadable:
    'That file could not be read. Choose a creative library file exported from this app. Your library is unchanged.',
  'not-a-library-file':
    'That file is not a creative library export. Choose a file exported from this app. Your library is unchanged.',
  'unsupported-file-version':
    'That file was written by a different version of this app and cannot be imported here. Your library is unchanged.',
  'unsupported-store-version':
    'That file holds an older creative library that cannot be imported here. Your library is unchanged.',
  lossy:
    'Some records in that file are damaged or incomplete, so importing it would lose part of your library. Your library is unchanged.',
};

export type CreativeLibraryFileReadResult =
  | { readonly ok: true; readonly file: CreativeLibraryExportFile }
  | { readonly ok: false; readonly message: string };

export const creativeLibraryExportFilename = (exportedAt: string): string =>
  `creative-library-${exportedAt.slice(0, 10)}.json`;

/** Serializes the current library and hands it to the browser as a download. */
export const downloadCreativeLibraryExport = (
  store: CreativeAssetStore,
  exportedAt: string,
): CreativeLibraryExportFile => {
  if (typeof URL.createObjectURL !== 'function') {
    throw new Error('This browser cannot save a file from the page.');
  }
  const exported = createCreativeLibraryExportFile(store, exportedAt);
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = creativeLibraryExportFilename(exported.exportedAt);
  anchor.rel = 'noopener';
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Revoked after the click has been dispatched; revoking synchronously cancels the download.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
  return exported;
};

/**
 * Reads a chosen file into a validated export, refusing before it commits to anything.
 *
 * The size bound is applied to the file rather than to its text, so an oversized file is never
 * read into memory at all.
 */
export const readCreativeLibraryFile = async (
  file: File,
): Promise<CreativeLibraryFileReadResult> => {
  if (file.size > CREATIVE_LIBRARY_EXPORT_MAX_BYTES) {
    return { ok: false, message: REFUSAL_MESSAGES['too-large'] };
  }
  let serialized: string;
  try {
    serialized = await file.text();
  } catch {
    return { ok: false, message: REFUSAL_MESSAGES.unreadable };
  }
  const parsed = parseCreativeLibraryExportFile(serialized);
  return parsed.ok
    ? { ok: true, file: parsed.file }
    : { ok: false, message: REFUSAL_MESSAGES[parsed.refusal] };
};
