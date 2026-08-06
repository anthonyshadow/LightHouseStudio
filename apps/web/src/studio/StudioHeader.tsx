import { useTheme } from '@emotion/react';
import type { AuthenticatedUser } from '@studio/contracts';
import { referenceImageContentUrl } from '../adapters/api-client/referenceImageRoutes';
import { AccountMenu } from '../features/account/AccountMenu';
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
  showAiSelector?: boolean;
  selectorLabel?: string;
  activeCharacterName?: string | undefined;
  activeCharacterImageAssetId?: string | null | undefined;
  onOpenCharacterSelector: () => void;
  onClearCharacter: () => void;
  clearCharacterDisabledReason?: string | undefined;
  user: AuthenticatedUser;
  accountBusy?: boolean;
  onOpenVideos: () => void;
  onOpenCharacters: () => void;
  onOpenOutfits: () => void;
  onLogout: () => void;
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

const ChevronDownIcon = () => (
  <svg data-character-chevron aria-hidden="true" viewBox="0 0 16 16" fill="none">
    <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const StudioHeader = ({
  availability,
  browser,
  capabilityState,
  characterSelectorRef,
  activeCharacterName,
  activeCharacterImageAssetId,
  onOpenCharacterSelector,
  onClearCharacter,
  clearCharacterDisabledReason,
  showAiSelector = true,
  selectorLabel = 'Select Character',
  user,
  accountBusy,
  onOpenVideos,
  onOpenCharacters,
  onOpenOutfits,
  onLogout,
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
      <div css={{ display: 'flex', alignItems: 'center', gap: theme.space.xs, minWidth: 0 }}>
        <div css={brandStyles(theme)}>
          <img src="/favicon.svg" alt="" width="38" height="38" />
          <div>
            <h1>Lightframe Studio</h1>
            <span>Local-first studio</span>
          </div>
        </div>
        <AccountMenu
          user={user}
          busy={accountBusy}
          onOpenVideos={onOpenVideos}
          onOpenCharacters={onOpenCharacters}
          onOpenOutfits={onOpenOutfits}
          onLogout={onLogout}
        />
      </div>
      {showAiSelector ? (
        <div css={characterSelectorStyles(theme)}>
          <Button
            ref={characterSelectorRef}
            variant="secondary"
            aria-haspopup="dialog"
            aria-label={
              activeCharacterName
                ? `Selected AI: ${activeCharacterName}. Open ${selectorLabel} options`
                : `No AI selected. Open ${selectorLabel} options`
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
            <span data-character-label>{activeCharacterName ?? selectorLabel}</span>
            <ChevronDownIcon />
          </Button>
          {activeCharacterName ? (
            <Button
              data-clear-character="true"
              variant="quiet"
              aria-label={`Unselect AI: ${activeCharacterName}`}
              title={clearCharacterDisabledReason ?? `Unselect ${activeCharacterName}`}
              disabled={Boolean(clearCharacterDisabledReason)}
              onClick={onClearCharacter}
            >
              <span aria-hidden="true">×</span>
            </Button>
          ) : null}
        </div>
      ) : (
        <span aria-hidden="true" />
      )}
      <details css={capabilityStyles(theme)} aria-label="Integration availability">
        <summary>
          <span css={systemStatusDotStyles(theme, systemState)} aria-hidden="true" />
          <span data-system-label>{systemLabel}</span>
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
