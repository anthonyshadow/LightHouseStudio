import { lazy, Suspense, type RefObject } from 'react';
import type { useStudioLogoutController } from '../../studio/useStudioLogoutController';
import type { useStudioSessionExpiryController } from '../../studio/useStudioSessionExpiryController';
import { UNSAVED_WORK_DISCARD_NOTICE } from '../../studio/sessionNotices';
import {
  Button,
  ConfirmationRequestDialog,
  OverlayPanel,
  type ConfirmationRequest,
} from '../../ui';

const ConfirmationDialog = lazy(() =>
  import('../../ui/primitives/ConfirmationDialog').then((module) => ({
    default: module.ConfirmationDialog,
  })),
);
const SessionExpiryNotice = lazy(() =>
  import('../../studio/SessionExpiryNotice').then((module) => ({
    default: module.SessionExpiryNotice,
  })),
);

interface ShellLifecycleDialogsProps {
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly logout: ReturnType<typeof useStudioLogoutController>;
  readonly sessionExpiry: ReturnType<typeof useStudioSessionExpiryController>;
  /**
   * The shell's awaitable confirmations. Rendered here because the shell outlives every surface
   * that asks one, so a confirmation cannot be torn down by the navigation it is asking about.
   */
  readonly confirmation: ConfirmationRequest;
}

/**
 * The dialogs that belong to the authenticated session rather than to any one surface: awaitable
 * confirmations, logout, and session expiry. They stay mounted on every protected route, which is
 * what lets logout and expiry be answered from the Dashboard as well as from Studio.
 */
export const ShellLifecycleDialogs = ({
  mainRef,
  logout,
  sessionExpiry,
  confirmation,
}: ShellLifecycleDialogsProps) => (
  <>
    <ConfirmationRequestDialog request={confirmation} returnFocusRef={mainRef} />

    {/*
      Deferred like the other end-of-session surfaces: it is only reachable once a session actually
      expires, and the shell's static closure has a hard byte budget. The chunk is a same-origin
      asset, not an API call, so the expired session does not block it; if it failed to load, the
      route error boundary would unmount the shell, which releases the teardown hold and completes
      the redirect — the pre-fix behaviour, not a stuck app.
    */}
    <Suspense fallback={null}>
      <SessionExpiryNotice
        open={sessionExpiry.noticeOpen}
        activeWork={sessionExpiry.hasActiveWork}
        projectProposal={sessionExpiry.hasProjectProposal}
        busy={sessionExpiry.busy}
        returnFocusRef={mainRef}
        onAcknowledge={sessionExpiry.acknowledge}
      />
    </Suspense>

    <Suspense fallback={null}>
      <ConfirmationDialog
        open={logout.promptOpen}
        title={
          logout.failure
            ? 'Could not log out'
            : logout.hasProjectProposal
              ? 'Log out and discard unsaved Project changes?'
              : 'Log out and discard temporary work?'
        }
        description={
          logout.failure
            ? 'Cleanup and sign-out did not complete. Lightframe kept you in Studio so you can retry without silently abandoning the session.'
            : logout.hasProjectProposal
              ? 'Project saving did not complete. Logging out now explicitly discards the preserved local proposal plus any temporary media or library work. Autosaved Project changes remain available.'
              : `Logging out stops your camera and microphone. ${UNSAVED_WORK_DISCARD_NOTICE}`
        }
        alert={logout.failure ?? undefined}
        confirmLabel={
          logout.busy ? 'Logging out…' : logout.failure ? 'Retry logout' : 'Log out and discard'
        }
        cancelLabel="Stay in Studio"
        danger
        busy={logout.busy}
        returnFocusRef={mainRef}
        onCancel={logout.dismissPrompt}
        onConfirm={logout.confirmDiscard}
      />
      <OverlayPanel
        open={logout.blockedOpen}
        onClose={logout.dismissBlocked}
        title="Finish active work before logging out"
        description="Stop recording, wait for finalization or provider processing, or cancel the active video render before logging out."
        placement="bottom"
        size="standard"
        returnFocusRef={mainRef}
        footer={
          <Button variant="primary" onClick={logout.dismissBlocked}>
            Return to Studio
          </Button>
        }
      >
        <p>Lightframe will not abandon active media work during logout.</p>
      </OverlayPanel>
    </Suspense>
  </>
);
