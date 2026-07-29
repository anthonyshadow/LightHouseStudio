import { useTheme } from '@emotion/react';
import { referenceImageContentUrl } from '../adapters/api-client/apiClient';
import type { BrowserCapabilities, ProviderAvailability } from '../features/media-session';
import type { RefObject } from 'react';
import { Button } from '../ui';
import {
  brandStyles,
  capabilityDetailStyles,
  capabilityStyles,
  characterSelectorStyles,
  headerStyles,
  systemStatusDotStyles,
} from './StudioApp.styles';

export type CapabilityState = 'loading' | 'ready' | 'error';

type StudioHeaderProps = {
  availability: ProviderAvailability;
  browser: BrowserCapabilities;
  capabilityState: CapabilityState;
  characterSelectorRef: RefObject<HTMLButtonElement | null>;
  activeCharacterName?: string | undefined;
  activeCharacterImageAssetId?: string | null | undefined;
  onOpenCharacterSelector: () => void;
};

const capabilityLabel = (
  state: CapabilityState,
  available: boolean,
  unavailableLabel: string,
): string => {
  if (state === 'loading') return 'checking';
  if (state === 'error') return 'configuration unavailable';
  return available ? 'configured' : unavailableLabel;
};

const systemStatusLabel = (
  capabilityState: CapabilityState,
  systemState: 'loading' | 'ready' | 'limited',
): string => {
  if (capabilityState === 'loading') return 'Checking integrations';
  if (capabilityState === 'error') return 'Integration status unavailable';
  return systemState === 'ready' ? 'Studio available to try' : 'Studio limited';
};

export const StudioHeader = ({
  availability,
  browser,
  capabilityState,
  characterSelectorRef,
  activeCharacterName,
  activeCharacterImageAssetId,
  onOpenCharacterSelector,
}: StudioHeaderProps) => {
  const theme = useTheme();
  const localCaptureAvailable = browser.mediaDevices && browser.secureContext;
  const localCaptureState = localCaptureAvailable ? 'available' : 'unavailable';
  const aiVideoState = capabilityLabel(capabilityState, availability.decart, 'not configured');
  const voiceCloudState = capabilityLabel(
    capabilityState,
    availability.elevenLabs,
    'not configured (optional)',
  );
  const systemState =
    capabilityState === 'loading'
      ? 'loading'
      : localCaptureAvailable && availability.decart
        ? 'ready'
        : 'limited';
  const systemLabel = systemStatusLabel(capabilityState, systemState);
  const characterImageUrl = activeCharacterImageAssetId
    ? referenceImageContentUrl(activeCharacterImageAssetId)
    : null;

  return (
    <header css={headerStyles(theme)}>
      <div css={brandStyles(theme)}>
        <img src="/favicon.svg" alt="" width="38" height="38" />
        <div>
          <h1>Lightframe Studio</h1>
          <span>Local-first creative camera</span>
        </div>
      </div>
      <div css={characterSelectorStyles(theme)}>
        <Button
          ref={characterSelectorRef}
          variant="secondary"
          aria-haspopup="dialog"
          aria-label={
            activeCharacterName
              ? `Selected character: ${activeCharacterName}. Open character options`
              : 'No character selected. Open character options'
          }
          onClick={onOpenCharacterSelector}
        >
          {characterImageUrl ? (
            <img src={characterImageUrl} alt="" width="26" height="26" />
          ) : (
            <span data-character-placeholder aria-hidden="true">
              ✦
            </span>
          )}
          <span data-character-label>{activeCharacterName ?? 'Character: None Selected'}</span>
        </Button>
      </div>
      <details css={capabilityStyles(theme)} aria-label="Integration availability">
        <summary>
          <span css={systemStatusDotStyles(theme, systemState)} aria-hidden="true" />
          <span>{systemLabel}</span>
        </summary>
        <div css={capabilityDetailStyles(theme)}>
          <span>
            Local capture <strong>{localCaptureState}</strong>
          </span>
          <span>
            AI video <strong>{aiVideoState}</strong>
          </span>
          <span>
            Voice cloud <strong>{voiceCloudState}</strong>
          </span>
        </div>
      </details>
    </header>
  );
};
