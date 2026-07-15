import { useTheme } from '@emotion/react';
import { useLayoutEffect, useRef } from 'react';
import { Button } from '../../ui';
import type { StudioSessionController } from './types';
import { modeLabel } from './types';
import { hasDraftContent } from './draftPolicy';
import { composerActionsStyles } from './SessionComposer.styles';
import { isModelSessionActive } from './sessionComposerModel';

export interface SessionActionsProps {
  session: StudioSessionController;
  recording: boolean;
  onReset: () => void;
}

export const SessionActions = ({ session, recording, onReset }: SessionActionsProps) => {
  const theme = useTheme();
  const model = session.draft.mode !== 'local';
  const active = isModelSessionActive(session);
  const draftHasContent = hasDraftContent(session.draft);
  const actionState = !model
    ? session.localStream
      ? 'local-live'
      : 'local-idle'
    : active
      ? 'model-active'
      : 'model-idle';
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
            onClick={session.stopCamera}
          >
            Stop camera
          </Button>
        ) : (
          <Button
            key="local-start"
            ref={primaryActionRef}
            variant="primary"
            busy={session.lifecycle === 'requesting-media'}
            onClick={() => void session.startLocal()}
          >
            Start local preview
          </Button>
        )}
      </div>
    );
  }

  if (active) {
    return (
      <div key={actionState} css={composerActionsStyles(theme)}>
        <Button
          key="model-apply"
          variant="primary"
          busy={session.applying}
          disabled={
            !session.pendingChanges || !['connected', 'generating'].includes(session.lifecycle)
          }
          onClick={() => void session.applyChanges()}
        >
          Apply changes
        </Button>
        <Button
          key="model-revert"
          variant="quiet"
          disabled={!session.pendingChanges}
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
      </div>
    );
  }

  return (
    <div key={actionState} css={composerActionsStyles(theme)}>
      <Button key="model-preflight" variant="secondary" onClick={() => void session.preflight()}>
        Check camera &amp; mic
      </Button>
      <Button
        key="model-start"
        ref={primaryActionRef}
        variant="primary"
        busy={['requesting-media', 'requesting-token', 'connecting'].includes(session.lifecycle)}
        onClick={() => void session.startModel()}
      >
        Start {modeLabel(session.draft.mode)} AI
      </Button>
      <Button key="model-clear" variant="quiet" disabled={!draftHasContent} onClick={onReset}>
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
    </div>
  );
};
