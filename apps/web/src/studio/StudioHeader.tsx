import { useTheme } from '@emotion/react';
import type { BrowserCapabilities, ProviderAvailability } from '../features/media-session';
import { Button, StatusNotice } from '../ui';
import {
  brandStyles,
  capabilityPillStyles,
  capabilityStyles,
  headerStyles,
} from './StudioApp.styles';

export type CapabilityState = 'loading' | 'ready' | 'error';

type StudioHeaderProps = {
  availability: ProviderAvailability;
  browser: BrowserCapabilities;
  capabilityState: CapabilityState;
  onRetry(): void;
};

const capabilityLabel = (
  state: CapabilityState,
  available: boolean,
  unavailableLabel: string,
): string => {
  if (state === 'loading') return 'checking';
  if (state === 'error') return 'status unavailable';
  return available ? 'available' : unavailableLabel;
};

export const StudioHeader = ({
  availability,
  browser,
  capabilityState,
  onRetry,
}: StudioHeaderProps) => {
  const theme = useTheme();
  const localCaptureAvailable = browser.mediaDevices && browser.secureContext;
  const localCaptureStatus = `Local capture ${localCaptureAvailable ? 'ready' : 'unavailable'}`;
  const aiVideoStatus = `AI video ${capabilityLabel(
    capabilityState,
    availability.decart,
    'not configured',
  )}`;
  const voiceCloudStatus = `Voice cloud ${capabilityLabel(
    capabilityState,
    availability.elevenLabs,
    'optional',
  )}`;

  return (
    <>
      <header css={headerStyles(theme)}>
        <div css={brandStyles(theme)}>
          <img src="/favicon.svg" alt="" width="38" height="38" />
          <div>
            <h1>Lightframe Studio</h1>
            <span>Local-first creative camera</span>
          </div>
        </div>
        <div
          css={capabilityStyles(theme)}
          aria-label="Integration availability"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span
            css={capabilityPillStyles(theme, localCaptureAvailable)}
            aria-label={localCaptureStatus}
            title={localCaptureStatus}
          >
            {localCaptureStatus}
          </span>
          <span
            css={capabilityPillStyles(theme, capabilityState === 'ready' && availability.decart)}
            aria-label={aiVideoStatus}
            title={aiVideoStatus}
          >
            {aiVideoStatus}
          </span>
          <span
            css={capabilityPillStyles(
              theme,
              capabilityState === 'ready' && availability.elevenLabs,
            )}
            aria-label={voiceCloudStatus}
            title={voiceCloudStatus}
          >
            {voiceCloudStatus}
          </span>
        </div>
      </header>

      {capabilityState === 'error' ? (
        <StatusNotice role="status" tone="warning" title="Integration broker is unreachable">
          Local preparation still works, but provider availability could not be checked.
          <Button size="small" variant="quiet" onClick={onRetry}>
            Retry check
          </Button>
        </StatusNotice>
      ) : null}

      {!localCaptureAvailable ? (
        <StatusNotice
          tone="danger"
          role="alert"
          title="Camera capture needs a secure supported browser"
        >
          Open the studio on localhost or HTTPS in a current browser with camera and microphone
          APIs.
        </StatusNotice>
      ) : null}
    </>
  );
};
