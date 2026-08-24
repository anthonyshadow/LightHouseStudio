import { useTheme } from '@emotion/react';
import { useRef, type MouseEvent } from 'react';
import { Button, ConfirmationRequestDialog, StatusNotice, useConfirmationRequest } from '../../ui';
import type { CreativeLibraryCloudSync } from './useCreativeLibraryCloudSync';

/** The recovery actions only. Where the library is stored is a different question, asked elsewhere. */
export type CreativeLibrarySyncNoticeProps = Pick<
  CreativeLibraryCloudSync,
  'status' | 'retry' | 'keepLocal' | 'keepCloud'
>;

const KEEP_LOCAL = {
  title: 'Save the current creative library to your account?',
  description:
    'The account copy of your Characters, Outfits and saved prompts is replaced with the current copy. Changes saved only by another session are lost.',
  confirmLabel: 'Save current copy',
  danger: true,
} as const;

const KEEP_CLOUD = {
  title: 'Reload the account creative library?',
  description:
    'The current Characters, Outfits and saved prompts are replaced with the account copy. Any unsynced changes in this session are lost.',
  confirmLabel: 'Reload account copy',
  danger: true,
} as const;

/**
 * The recovery surface for a paused cloud creative library.
 *
 * Before this existed the pause was genuinely terminal: the sync hook wrote a sentence into
 * repository state that no component read, dropped its subscription, and left the operator with a
 * silently unsynchronized library on every device. Both resolutions overwrite one copy with the
 * other, so both are confirmed.
 */
export const CreativeLibrarySyncNotice = ({
  status,
  retry,
  keepLocal,
  keepCloud,
}: CreativeLibrarySyncNoticeProps) => {
  const theme = useTheme();
  const confirmation = useConfirmationRequest();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  if (status.state !== 'paused') return null;

  const resolve = (
    event: MouseEvent<HTMLButtonElement>,
    question: typeof KEEP_LOCAL | typeof KEEP_CLOUD,
    apply: () => void,
  ) => {
    returnFocusRef.current = event.currentTarget;
    void confirmation.ask(question).then((confirmed) => {
      if (confirmed) apply();
    });
  };

  return (
    <>
      <StatusNotice
        role="status"
        tone="warning"
        title="Account library sync paused"
        data-creative-sync-notice=""
      >
        <p>{status.message}</p>
        <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.sm }}>
          <Button size="small" onClick={retry}>
            Try again
          </Button>
          {/* Nothing to choose between when the server could not be reached at all. */}
          {status.reason === 'unavailable' ? null : (
            <>
              <Button size="small" onClick={(event) => resolve(event, KEEP_LOCAL, keepLocal)}>
                {KEEP_LOCAL.confirmLabel}
              </Button>
              <Button size="small" onClick={(event) => resolve(event, KEEP_CLOUD, keepCloud)}>
                {KEEP_CLOUD.confirmLabel}
              </Button>
            </>
          )}
        </div>
      </StatusNotice>
      <ConfirmationRequestDialog request={confirmation} returnFocusRef={returnFocusRef} />
    </>
  );
};
