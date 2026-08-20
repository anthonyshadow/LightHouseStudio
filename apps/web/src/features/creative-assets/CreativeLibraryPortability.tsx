import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { CreativeLibraryExportFile } from '@studio/domain';
import { useRef, useState } from 'react';
import { Button, ConfirmationDialog, StatusNotice } from '../../ui';
import { downloadCreativeLibraryExport, readCreativeLibraryFile } from './creativeLibraryFile';
import {
  CREATIVE_LIBRARY_EXPORT_CONTENTS_NOTE,
  creativeLibraryStorageDetail,
  describeCreativeLibraryContents,
} from './creativeLibraryStorage';
import type { CreativeAssetRepository, CreativeAssetStore } from './types';
import type { CreativeLibraryMirror } from './useCreativeLibraryCloudSync';

const portabilityStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  '& p': { margin: 0, color: theme.colors.textMuted, lineHeight: 1.5 },
  '& [data-library-portability-actions]': {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
});

/**
 * The result of the last export or import attempt. One value, because there is only ever one: a
 * refusal carries its own title, since an export that fails is not a file that was refused.
 */
type CreativeLibraryPortabilityOutcome =
  | { readonly kind: 'success'; readonly message: string }
  | { readonly kind: 'failure'; readonly title: string; readonly message: string };

interface CreativeLibraryPortabilityProps {
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly mirror: CreativeLibraryMirror;
}

/**
 * Export and import for the whole creative library, plus the plain truth about where it lives.
 *
 * It replaces through `replaceFromRemote` rather than a second write path: that is already the
 * repository's whole-store swap — it re-sanitizes, refuses a non-canonical store, commits once and
 * notifies subscribers, which is what keeps the cloud mirror pushing normally after an import.
 * It is deliberately not part of `SavedCharacterLibrary`, which also mounts as an in-session
 * picker where managing the library is not the job.
 */
export const CreativeLibraryPortability = ({
  repository,
  store,
  mirror,
}: CreativeLibraryPortabilityProps) => {
  const theme = useTheme();
  const pickerRef = useRef<HTMLInputElement>(null);
  const importTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [outcome, setOutcome] = useState<CreativeLibraryPortabilityOutcome | null>(null);
  const [candidate, setCandidate] = useState<CreativeLibraryExportFile | null>(null);
  const [replaceFailure, setReplaceFailure] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  const exportLibrary = () => {
    try {
      const exported = downloadCreativeLibraryExport(store, new Date().toISOString());
      setOutcome({
        kind: 'success',
        message: `Creative library exported: ${describeCreativeLibraryContents(exported.store)}.`,
      });
    } catch {
      setOutcome({
        kind: 'failure',
        title: 'The library was not exported',
        message: 'This browser could not save the file. Your library is unchanged.',
      });
    }
  };

  const chooseFile = async (file: File) => {
    setOutcome(null);
    const result = await readCreativeLibraryFile(file);
    if (!result.ok) {
      setOutcome({ kind: 'failure', title: 'That file was not imported', message: result.message });
      return;
    }
    setReplaceFailure(null);
    setCandidate(result.file);
  };

  const closeConfirmation = () => {
    if (replacing) return;
    setCandidate(null);
    setReplaceFailure(null);
  };

  const replaceLibrary = async () => {
    const replace = repository.replaceFromRemote;
    if (candidate === null || replacing) return;
    if (replace === undefined) {
      setReplaceFailure('This library cannot be replaced here. Your library is unchanged.');
      return;
    }
    setReplacing(true);
    setReplaceFailure(null);
    try {
      await replace(candidate.store);
      setCandidate(null);
      setOutcome({
        kind: 'success',
        message: `Creative library replaced from the file: ${describeCreativeLibraryContents(candidate.store)}.`,
      });
    } catch {
      setReplaceFailure(
        'The creative library could not be replaced. Your library is unchanged — try the file again.',
      );
    } finally {
      setReplacing(false);
    }
  };

  return (
    <>
      <div css={portabilityStyles(theme)} data-creative-library-portability="">
        <p>
          {creativeLibraryStorageDetail(mirror)} {CREATIVE_LIBRARY_EXPORT_CONTENTS_NOTE}
        </p>
        <input
          ref={pickerRef}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void chooseFile(file);
          }}
        />
        <div data-library-portability-actions>
          <Button variant="secondary" onClick={exportLibrary}>
            Export library
          </Button>
          <Button
            variant="secondary"
            onClick={(event) => {
              importTriggerRef.current = event.currentTarget;
              pickerRef.current?.click();
            }}
          >
            Import library
          </Button>
        </div>
        {/* Persistent, so an outcome inserted into it is announced rather than merely rendered. */}
        <div role="status">
          {outcome?.kind === 'success' ? (
            <StatusNotice tone="success">{outcome.message}</StatusNotice>
          ) : null}
        </div>
        {outcome?.kind === 'failure' ? (
          <StatusNotice role="alert" tone="danger" title={outcome.title}>
            {outcome.message}
          </StatusNotice>
        ) : null}
      </div>
      <ConfirmationDialog
        open={candidate !== null}
        title="Replace this browser’s creative library?"
        description="Every Character, Outfit, wardrobe variant and saved prompt in this browser is replaced with the contents of the file. Anything not in the file is lost."
        body={
          <>
            <p>
              The file holds{' '}
              {candidate ? describeCreativeLibraryContents(candidate.store) : 'no records'}.
            </p>
            <p>
              Reference images are not in the file. Imported records point at images already stored
              for this account; any that are missing stay missing.
            </p>
          </>
        }
        alert={replaceFailure ?? undefined}
        alertTitle={replaceFailure ? 'The library was not replaced' : undefined}
        confirmLabel={replacing ? 'Replacing library…' : 'Replace library'}
        cancelLabel="Keep this library"
        danger
        busy={replacing}
        returnFocusRef={importTriggerRef}
        onCancel={closeConfirmation}
        onConfirm={() => void replaceLibrary()}
      />
    </>
  );
};
