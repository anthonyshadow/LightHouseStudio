import { useTheme } from '@emotion/react';
import { useId, useLayoutEffect, useRef } from 'react';
import { Button } from '../../ui';
import type { StudioSessionController } from './types';
import { modeLabel } from './types';
import { hasDraftContent } from './draftPolicy';
import { actionReasonStyles, composerActionsStyles } from './SessionComposer.styles';
import { isModelSessionActive } from './sessionComposerModel';

export interface SessionActionsProps {
  session: StudioSessionController;
  recording: boolean;
  lockReason?: string | undefined;
  onReset: () => void;
}

export const SessionActions = ({
  session,
  recording,
  lockReason,
  onReset,
}: SessionActionsProps) => {
  const theme = useTheme();
  const model = session.draft.mode !== 'local';
  const active = isModelSessionActive(session);
  const draftHasContent = hasDraftContent(session.draft);
  const hasStartContent = Boolean(session.draft.prompt.trim() || session.draft.image);
  const reasonId = useId();
  let actionState: 'local-live' | 'local-idle' | 'model-active' | 'model-idle';
  if (!model) actionState = session.localStream ? 'local-live' : 'local-idle';
  else actionState = active ? 'model-active' : 'model-idle';
  const previousActionStateRef = useRef(actionState);
  const primaryActionRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (previousActionStateRef.current === actionState) return;
    previousActionStateRef.current = actionState;
    if (document.activeElement === document.body) primaryActionRef.current?.focus();
  }, [actionState]);

  if (!model) {
    return (
      <div key={actionState} css={composerActionsStyles(theme)}>
        {session.localStream ? (
          <Button
            key="local-stop"
            ref={primaryActionRef}
            variant="danger"
            disabled={recording}
            aria-describedby={recording ? reasonId : undefined}
            onClick={session.stopCamera}
          >
            Stop camera
          </Button>
        ) : (
          <Button
            key="local-start"
            ref={primaryActionRef}
            variant="primary"
            disabled={recording}
            busy={session.lifecycle === 'requesting-media'}
            aria-describedby={recording ? reasonId : undefined}
            onClick={() => void session.startLocal()}
          >
            Start local preview
          </Button>
        )}
        {recording ? (
          <p id={reasonId} css={actionReasonStyles(theme)}>
            {lockReason ?? 'Finish the current take before changing the camera session.'}
          </p>
        ) : null}
      </div>
    );
  }

  if (active) {
    let applyReason: string | null = null;
    if (recording)
      applyReason = lockReason ?? 'Finish the current take before changing the live recipe.';
    else if (!hasStartContent) {
      applyReason = 'Add a direction or reference image before applying this draft.';
    } else if (!session.pendingChanges) {
      applyReason = 'Edit the working draft before applying changes.';
    } else if (!['connected', 'generating'].includes(session.lifecycle)) {
      applyReason = 'Wait for the live AI connection before applying changes.';
    }

    return (
      <div key={actionState} css={composerActionsStyles(theme)}>
        <Button
          key="model-apply"
          variant="primary"
          busy={session.applying}
          disabled={Boolean(applyReason)}
          aria-describedby={applyReason ? reasonId : undefined}
          onClick={() => void session.applyChanges()}
        >
          Apply changes
        </Button>
        <Button
          key="model-revert"
          variant="quiet"
          disabled={recording || session.applying || !session.pendingChanges}
          onClick={session.revertDraft}
        >
          Revert draft
        </Button>
        <Button
          key="model-stop"
          ref={primaryActionRef}
          variant="secondary"
          disabled={recording}
          onClick={session.stopModel}
        >
          {['connected', 'generating', 'reconnecting'].includes(session.lifecycle)
            ? 'Stop AI'
            : 'Cancel AI start'}
        </Button>
        <Button key="model-reset" variant="danger" disabled={recording} onClick={onReset}>
          Reset AI
        </Button>
        {applyReason ? (
          <p id={reasonId} css={actionReasonStyles(theme)}>
            {applyReason}
          </p>
        ) : null}
      </div>
    );
  }

  let startReason: string | null = null;
  if (recording)
    startReason = lockReason ?? 'Finish the current take before starting an AI session.';
  else if (!hasStartContent) {
    startReason =
      session.draft.mode === 'lucy-2.5'
        ? 'Add a character direction or portrait reference to start.'
        : 'Add a garment direction or garment reference to start.';
  }

  return (
    <div key={actionState} css={composerActionsStyles(theme)}>
      <Button
        key="model-start"
        ref={primaryActionRef}
        variant="primary"
        disabled={Boolean(startReason)}
        busy={['requesting-media', 'requesting-token', 'connecting'].includes(session.lifecycle)}
        aria-describedby={startReason ? reasonId : undefined}
        onClick={() => void session.startModel()}
      >
        Start {modeLabel(session.draft.mode)} AI
      </Button>
      <Button
        key="model-preflight"
        variant="secondary"
        disabled={recording}
        onClick={() => void session.preflight()}
      >
        Check camera &amp; mic
      </Button>
      <Button
        key="model-clear"
        variant="quiet"
        disabled={recording || !draftHasContent}
        onClick={onReset}
      >
        Clear draft
      </Button>
      {session.localStream ? (
        <Button
          key="model-release-media"
          variant="danger"
          disabled={recording}
          onClick={session.stopCamera}
        >
          Release camera &amp; mic
        </Button>
      ) : null}
      {startReason ? (
        <p id={reasonId} css={actionReasonStyles(theme)}>
          {startReason}
        </p>
      ) : null}
    </div>
  );
};
