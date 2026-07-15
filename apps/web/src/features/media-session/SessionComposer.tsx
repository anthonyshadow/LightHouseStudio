import { useState } from 'react';
import { useTheme } from '@emotion/react';
import { SegmentedControl, StatusNotice, Surface } from '../../ui';
import type { StudioSessionController } from './types';
import { confirmModeReplacement, hasDraftContent } from './draftPolicy';
import { ModelRecipeFields } from './ModelRecipeFields';
import { SessionActions } from './SessionActions';
import {
  composerHeadingStyles,
  composerStackStyles,
  providerDisclosureStyles,
} from './SessionComposer.styles';
import { isModelSessionActive, studioModeOptions } from './sessionComposerModel';
import type { StudioMode } from './types';

export interface SessionComposerProps {
  session: StudioSessionController;
  recording: boolean;
  onOpenWorkshop: () => void;
}

export const SessionComposer = ({ session, recording, onOpenWorkshop }: SessionComposerProps) => {
  const theme = useTheme();
  const [modeSwitchNotice, setModeSwitchNotice] = useState(false);
  const [modelFieldsRevision, setModelFieldsRevision] = useState(0);
  const model = session.draft.mode !== 'local';
  const modeLocked = recording || isModelSessionActive(session) || Boolean(session.localStream);

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
    <Surface as="aside" aria-labelledby="recipe-heading">
      <div css={composerStackStyles(theme)}>
        <header css={composerHeadingStyles(theme)}>
          <h2 id="recipe-heading">Recipe dock</h2>
          <p>Prepare freely. Camera and provider work begin only from the actions below.</p>
        </header>

        <SegmentedControl
          label="Studio capability"
          value={session.draft.mode}
          options={studioModeOptions}
          disabled={modeLocked}
          onChange={changeMode}
        />

        {modeSwitchNotice ? (
          <StatusNotice tone="warning" role="status">
            Finish the current live or recording action before changing modes.
          </StatusNotice>
        ) : null}

        {model ? (
          <ModelRecipeFields
            key={`${session.draft.mode}-${modelFieldsRevision}`}
            session={session}
            recording={recording}
            onOpenWorkshop={onOpenWorkshop}
          />
        ) : (
          <StatusNotice title="Private local capture">
            Camera and microphone remain in this browser. Local mode never loads or contacts Decart.
          </StatusNotice>
        )}

        {session.error ? (
          <StatusNotice tone="danger" title={session.error.message} role="alert">
            {session.error.recovery ?? 'Review the setup and try again.'}
          </StatusNotice>
        ) : null}

        <SessionActions session={session} recording={recording} onReset={resetDraft} />

        {model ? (
          <p css={providerDisclosureStyles(theme)}>
            Starting AI sends live camera, the applied recipe, and optional reference to Decart
            while connected. Provider usage ends when you stop or finish a model take.
          </p>
        ) : null}
      </div>
    </Surface>
  );
};
