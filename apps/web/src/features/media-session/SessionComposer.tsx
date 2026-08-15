import { useState } from 'react';
import { useTheme } from '@emotion/react';
import { Button, SegmentedControl, StatusNotice, Surface } from '../../ui';
import type { StudioSessionController } from './types';
import { confirmModeReplacement, hasDraftContent } from './draftPolicy';
import { ModelRecipeFields } from './ModelRecipeFields';
import { SessionActions } from './SessionActions';
import {
  composerBodyStyles,
  composerFooterStyles,
  composerHeaderStyles,
  composerHeadingStyles,
  composerShellStyles,
} from './SessionComposer.styles';
import { DecartStartDisclosure } from './DecartStartDisclosure';
import { isModelSessionActive, studioModeOptions } from './sessionComposerModel';
import { AppliedRecipeSummary, SessionStatus } from './SessionStatus';
import type { StudioMode } from './types';

export interface SessionComposerProps {
  session: StudioSessionController;
  recording: boolean;
  lockReason?: string | undefined;
  modelStartBlockedReason?: string | undefined;
  onOpenWorkshop: () => void;
  embedded?: boolean;
  activeCharacterName?: string | undefined;
}

export const SessionComposer = ({
  session,
  recording,
  lockReason,
  modelStartBlockedReason,
  onOpenWorkshop,
  embedded = false,
  activeCharacterName,
}: SessionComposerProps) => {
  const theme = useTheme();
  const [modeSwitchNotice, setModeSwitchNotice] = useState(false);
  const [modelFieldsRevision, setModelFieldsRevision] = useState(0);
  const model = session.draft.mode !== 'local';
  const modeLocked = recording || isModelSessionActive(session);
  const formError =
    session.error && ['model-input-required', 'apply-failed'].includes(session.error.code)
      ? session.error
      : null;

  const changeMode = (mode: StudioMode) => {
    if (!confirmModeReplacement(session.draft, mode, (message) => window.confirm(message))) {
      return;
    }
    if (recording || !session.selectMode(mode)) {
      setModeSwitchNotice(true);
      return;
    }

    setModeSwitchNotice(false);
  };

  const resetDraft = () => {
    if (
      hasDraftContent(session.draft) &&
      !window.confirm(
        'Reset these AI settings? The working prompt and ephemeral image will be cleared; completed takes stay available.',
      )
    ) {
      return;
    }

    setModelFieldsRevision((revision) => revision + 1);
    session.resetModel();
  };

  return (
    <Surface
      as="aside"
      {...(embedded
        ? { 'aria-label': 'AI Settings controls' }
        : { 'aria-labelledby': 'ai-settings-heading' })}
      padding="compact"
      style={{ height: '100%', minHeight: 0, overflow: 'hidden', padding: 0 }}
    >
      <div css={composerShellStyles(theme)}>
        <header css={composerHeaderStyles(theme)}>
          {!embedded ? (
            <div css={composerHeadingStyles(theme)}>
              <span aria-hidden="true">✦</span>
              <h2 id="ai-settings-heading">AI Settings</h2>
              <p>Prepare freely. Camera and provider work begin only from explicit actions.</p>
            </div>
          ) : null}

          <SegmentedControl
            label="Studio capability"
            value={session.draft.mode}
            options={studioModeOptions}
            disabled={modeLocked}
            onChange={changeMode}
          />
        </header>

        <div data-scroll-region="ai-settings" css={composerBodyStyles(theme)}>
          {modeSwitchNotice ? (
            <StatusNotice tone="warning" role="status">
              {lockReason ?? 'Finish the current live or recording action before changing modes.'}
            </StatusNotice>
          ) : null}

          {activeCharacterName ? (
            <StatusNotice tone="neutral" role="status" title="Active character">
              {activeCharacterName} is preloaded. Apply or Start when you are ready.
            </StatusNotice>
          ) : null}

          <SessionStatus session={session} />

          {!model ? (
            <Button
              variant="secondary"
              disabled={modeLocked}
              title={
                modeLocked
                  ? 'Release camera and finish active work before opening Prompt Workshop.'
                  : undefined
              }
              onClick={onOpenWorkshop}
            >
              Open structured prompt workshop
            </Button>
          ) : null}

          {model ? (
            <ModelRecipeFields
              key={`${session.draft.mode}-${modelFieldsRevision}`}
              session={session}
              recording={recording}
              onOpenWorkshop={onOpenWorkshop}
            />
          ) : null}

          <AppliedRecipeSummary session={session} />

          {formError ? (
            <StatusNotice tone="danger" title={formError.message} role="alert">
              {formError.recovery ?? 'Review the setup and try again.'}
            </StatusNotice>
          ) : null}

          {model ? <DecartStartDisclosure /> : null}
        </div>

        <footer css={composerFooterStyles(theme)}>
          <SessionActions
            session={session}
            recording={recording}
            lockReason={lockReason}
            {...(modelStartBlockedReason ? { modelStartBlockedReason } : {})}
            onReset={resetDraft}
          />
        </footer>
      </div>
    </Surface>
  );
};
