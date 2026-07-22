import { useTheme } from '@emotion/react';
import type { BrowserCapabilities, ProviderAvailability } from '../features/media-session';
import type { RefObject } from 'react';
import { Button, VisuallyHidden } from '../ui';
import {
  brandStyles,
  capabilityPillStyles,
  capabilityStyles,
  characterBuilderActionStyles,
  headerStyles,
} from './StudioApp.styles';

export type CapabilityState = 'loading' | 'ready' | 'error';

type StudioHeaderProps = {
  availability: ProviderAvailability;
  browser: BrowserCapabilities;
  capabilityState: CapabilityState;
  characterBuilderButtonRef: RefObject<HTMLButtonElement | null>;
  characterBuilderDisabledReason?: string | undefined;
  onBuildCharacter: () => void;
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
  characterBuilderButtonRef,
  characterBuilderDisabledReason,
  onBuildCharacter,
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
    <header css={headerStyles(theme)}>
      <div css={brandStyles(theme)}>
        <img src="/favicon.svg" alt="" width="38" height="38" />
        <div>
          <h1>Lightframe Studio</h1>
          <span>Local-first creative camera</span>
        </div>
      </div>
      <div css={characterBuilderActionStyles()}>
        <Button
          ref={characterBuilderButtonRef}
          variant="primary"
          aria-disabled={Boolean(characterBuilderDisabledReason) || undefined}
          aria-haspopup="dialog"
          aria-describedby={
            characterBuilderDisabledReason ? 'character-builder-lock-reason' : undefined
          }
          title={characterBuilderDisabledReason}
          onClick={() => {
            if (!characterBuilderDisabledReason) onBuildCharacter();
          }}
        >
          Build Your Character
        </Button>
        {characterBuilderDisabledReason ? (
          <VisuallyHidden>
            <span id="character-builder-lock-reason">{characterBuilderDisabledReason}</span>
          </VisuallyHidden>
        ) : null}
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
          css={capabilityPillStyles(theme, capabilityState === 'ready' && availability.elevenLabs)}
          aria-label={voiceCloudStatus}
          title={voiceCloudStatus}
        >
          {voiceCloudStatus}
        </span>
      </div>
    </header>
  );
};
