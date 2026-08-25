import type { RefObject } from 'react';
import { Button, OverlayPanel } from '../ui';
import { UNSAVED_WORK_DISCARD_NOTICE } from './sessionNotices';

interface SessionExpiryNoticeProps {
  readonly open: boolean;
  readonly activeWork: boolean;
  readonly projectProposal: boolean;
  readonly busy: boolean;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onAcknowledge: () => void;
}

/**
 * The one surface a user gets when their session ends underneath them.
 *
 * `OverlayPanel` rather than `ConfirmationDialog` because there is no second choice to offer: the
 * session is already gone, so a "Stay" button would be a promise nothing can keep. Escape and the
 * close control are bound to the same acknowledgement so no interaction leaves the user parked.
 */
export const SessionExpiryNotice = ({
  open,
  activeWork,
  projectProposal,
  busy,
  returnFocusRef,
  onAcknowledge,
}: SessionExpiryNoticeProps) => (
  <OverlayPanel
    open={open}
    onClose={onAcknowledge}
    title="Your session ended"
    description="Lightframe could not keep you signed in, so this Studio session has to close. Work in progress cannot be saved without a session."
    placement="bottom"
    size="standard"
    closeOnBackdrop={false}
    closeDisabled={busy}
    returnFocusRef={returnFocusRef}
    footer={
      <Button variant="primary" onClick={onAcknowledge} disabled={busy}>
        {busy ? 'Closing…' : 'Log in again'}
      </Button>
    }
  >
    <p>
      {activeWork
        ? 'The recording, render, or provider processing running now will stop. Anything already saved to your account is unaffected.'
        : UNSAVED_WORK_DISCARD_NOTICE}
    </p>
    {projectProposal ? (
      <p>Unsaved Project changes cannot be saved without a session and will be discarded.</p>
    ) : null}
  </OverlayPanel>
);
