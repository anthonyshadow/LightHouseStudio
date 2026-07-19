import { useId } from 'react';
import { useTheme } from '@emotion/react';
import { StatusNotice } from '../../ui';
import { sessionSummaryStyles } from './SessionComposer.styles';
import { isModelSessionActive } from './sessionComposerModel';
import { modeLabel, type StudioSessionController } from './types';

export const SessionStatus = ({ session }: { session: StudioSessionController }) => {
  const model = session.draft.mode !== 'local';

  if (!model) {
    return session.localStream ? (
      <StatusNotice tone="success" title="Local preview is live" role="status">
        Your camera stays in this browser and is ready for framing and recording.
      </StatusNotice>
    ) : (
      <StatusNotice title="Private local capture">
        Camera and microphone remain in this browser. Local mode never loads or contacts Decart.
      </StatusNotice>
    );
  }

  const label = modeLabel(session.draft.mode);
  const statuses: Record<
    StudioSessionController['lifecycle'],
    {
      tone: 'neutral' | 'success' | 'warning' | 'danger';
      title: string;
      detail: string;
    }
  > = {
    idle: {
      tone: 'neutral',
      title: `Private ${label} preparation`,
      detail: 'Drafting and choosing a reference do not start camera or provider work.',
    },
    'requesting-media': {
      tone: 'neutral',
      title: 'Checking camera & microphone',
      detail: 'Your browser is requesting the local tracks needed for this session.',
    },
    ready: {
      tone: 'success',
      title: 'Camera & microphone checked',
      detail: 'The local preview is ready. Starting AI remains a separate explicit action.',
    },
    'requesting-token': {
      tone: 'neutral',
      title: 'Securing AI connection',
      detail: 'The app is requesting a short-lived credential for this session.',
    },
    connecting: {
      tone: 'neutral',
      title: `Connecting ${label} AI`,
      detail: 'Keep this panel open while the provider establishes the live output.',
    },
    connected: {
      tone: 'success',
      title: `${label} AI connected`,
      detail: 'The provider is connected and preparing transformed video frames.',
    },
    generating: {
      tone: 'success',
      title: `${label} AI is live`,
      detail: 'Transformed video is available. Draft edits remain pending until Apply Changes.',
    },
    reconnecting: {
      tone: 'warning',
      title: `Reconnecting ${label} AI`,
      detail: 'Local preview remains the fallback until transformed video is usable again.',
    },
    disconnected: {
      tone: 'warning',
      title: `${label} AI stopped`,
      detail: 'The provider session has ended. Your working draft remains available.',
    },
    error: {
      tone: 'danger',
      title: `${label} AI needs attention`,
      detail: 'Review the error below before trying again.',
    },
  };
  const status = statuses[session.lifecycle];

  return (
    <StatusNotice tone={status.tone} title={status.title} role="status">
      {status.detail}
    </StatusNotice>
  );
};

export const AppliedRecipeSummary = ({ session }: { session: StudioSessionController }) => {
  const theme = useTheme();
  const headingId = useId();
  if (!session.applied || !isModelSessionActive(session)) return null;

  return (
    <section aria-labelledby={headingId} css={sessionSummaryStyles(theme)}>
      <header>
        <h3 id={headingId}>Applied recipe</h3>
        <span>{session.lifecycle === 'generating' ? 'Live' : 'Active'}</span>
      </header>
      <p title={session.applied.prompt || 'Reference-led recipe'}>
        {session.applied.prompt || 'Reference-led recipe'}
      </p>
      <dl>
        <div>
          <dt>Mode</dt>
          <dd>{modeLabel(session.applied.mode)}</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd>{session.applied.referenceImage?.file.name ?? 'None'}</dd>
        </div>
        <div>
          <dt>Enhancement</dt>
          <dd>{session.applied.enhance ? 'On' : 'Off'}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{session.transformedVideoUsable ? 'Video ready' : 'Preparing'}</dd>
        </div>
      </dl>
    </section>
  );
};
