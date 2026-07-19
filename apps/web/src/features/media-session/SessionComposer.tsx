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
  providerDisclosureStyles,
} from './SessionComposer.styles';
import { isModelSessionActive, studioModeOptions } from './sessionComposerModel';
import { AppliedRecipeSummary, SessionStatus } from './SessionStatus';
import type { StudioMode } from './types';

export interface SessionComposerProps {
  session: StudioSessionController;
  recording: boolean;
  lockReason?: string | undefined;
  onOpenWorkshop: () => void;
  embedded?: boolean;
}

export const SessionComposer = ({
  session,
  recording,
  lockReason,
  onOpenWorkshop,
  embedded = false,
}: SessionComposerProps) => {
  const theme = useTheme();
  const [modeSwitchNotice, setModeSwitchNotice] = useState(false);
  const [modelFieldsRevision, setModelFieldsRevision] = useState(0);
  const model = session.draft.mode !== 'local';
  const modeLocked = recording || isModelSessionActive(session) || Boolean(session.localStream);
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
        'Reset this AI recipe? The working prompt and ephemeral image will be cleared; completed takes stay available.',
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
        ? { 'aria-label': 'Recipe Dock controls' }
        : { 'aria-labelledby': 'recipe-heading' })}
      padding="compact"
      style={{ height: '100%', minHeight: 0, overflow: 'hidden', padding: 0 }}
    >
      <div css={composerShellStyles(theme)}>
        <header css={composerHeaderStyles(theme)}>
          {!embedded ? (
            <div css={composerHeadingStyles(theme)}>
              <span aria-hidden="true">✦</span>
              <h2 id="recipe-heading">Recipe dock</h2>
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

        <div data-scroll-region="recipe-dock" css={composerBodyStyles(theme)}>
          {modeSwitchNotice ? (
            <StatusNotice tone="warning" role="status">
              {lockReason ?? 'Finish the current live or recording action before changing modes.'}
            </StatusNotice>
          ) : null}

          <SessionStatus session={session} />

          {!model ? (
            <Button
              variant="secondary"
              disabled={modeLocked}
              title={
                modeLocked
                  ? 'Release camera and finish active work before opening Character Workshop.'
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

          {model ? (
            <p css={providerDisclosureStyles(theme)}>
              Starting AI sends live camera, the applied recipe, and optional reference to Decart
              while connected. Provider usage ends when you stop or finish a model take.
            </p>
          ) : null}
        </div>

        <footer css={composerFooterStyles(theme)}>
          <SessionActions
            session={session}
            recording={recording}
            lockReason={lockReason}
            onReset={resetDraft}
          />
        </footer>
      </div>
    </Surface>
  );
};
