import { useTheme } from '@emotion/react';
import type { AuthenticatedUser } from '@studio/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountMenu } from '../features/account/AccountMenu';
import type { BrowserCapabilities, ProviderAvailability } from '../features/media-session';
import { Button } from '../ui';
import {
  brandStyles,
  capabilityDetailStyles,
  capabilityStyles,
  headerActionsStyles,
  headerStyles,
  primaryNavigationStyles,
  systemStatusDotStyles,
} from './StudioApp.styles';

export type CapabilityState = 'loading' | 'ready' | 'error';

type HeaderMenu = 'account' | 'status';

type StudioHeaderProps = {
  availability: ProviderAvailability;
  browser: BrowserCapabilities;
  capabilityState: CapabilityState;
  user: AuthenticatedUser;
  accountBusy?: boolean;
  activeDestination: 'studio' | 'projects';
  projectContextActive?: boolean;
  onOpenStudio: () => void;
  onOpenProjects: () => void;
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

type StatusMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemState: 'loading' | 'ready' | 'limited';
  systemLabel: string;
  localCaptureState: string;
  aiVideoState: string;
  voiceCloudState: string;
};

const StatusMenu = ({
  open,
  onOpenChange,
  systemState,
  systemLabel,
  localCaptureState,
  aiVideoState,
  voiceCloudState,
}: StatusMenuProps) => {
  const theme = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        onOpenChange(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [onOpenChange, open]);

  return (
    <div ref={rootRef} css={capabilityStyles(theme)} aria-label="Integration availability">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="studio-availability-details"
        onClick={() => onOpenChange(!open)}
      >
        <span css={systemStatusDotStyles(theme, systemState)} aria-hidden="true" />
        <span data-system-label>{systemLabel}</span>
      </button>
      {open ? (
        <div
          id="studio-availability-details"
          role="region"
          aria-label="Studio availability details"
          css={capabilityDetailStyles(theme)}
        >
          <div data-capability-heading>
            <strong>Studio availability</strong>
            <span>Browser support and configured integrations</span>
          </div>
          <span>
            Local capture <strong>{localCaptureState}</strong>
          </span>
          <span>
            AI video <strong>{aiVideoState}</strong>
          </span>
          <span>
            Voice cloud <strong>{voiceCloudState}</strong>
          </span>
          <small>Provider configuration does not verify live service health.</small>
        </div>
      ) : null}
    </div>
  );
};

export const StudioHeader = ({
  availability,
  browser,
  capabilityState,
  user,
  accountBusy,
  activeDestination,
  projectContextActive = false,
  onOpenStudio,
  onOpenProjects,
  onOpenVideos,
  onOpenCharacters,
  onOpenOutfits,
  onLogout,
}: StudioHeaderProps) => {
  const theme = useTheme();
  const [openMenu, setOpenMenu] = useState<HeaderMenu | null>(null);
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
  const setMenuOpen = useCallback((menu: HeaderMenu, open: boolean) => {
    setOpenMenu(open ? menu : null);
  }, []);

  return (
    <header css={headerStyles(theme)}>
      <div css={brandStyles(theme)}>
        <img src="/favicon.svg" alt="" width="38" height="38" />
        <div>
          <h1>Lightframe Studio</h1>
          <span>Local-first studio</span>
        </div>
      </div>
      <nav aria-label="Primary" css={primaryNavigationStyles(theme)}>
        <Button
          size="small"
          variant="quiet"
          aria-label={projectContextActive ? 'Exit Project to Studio' : undefined}
          aria-current={activeDestination === 'studio' ? 'page' : undefined}
          onClick={onOpenStudio}
        >
          Studio
        </Button>
        <Button
          size="small"
          variant="quiet"
          aria-current={activeDestination === 'projects' ? 'page' : undefined}
          onClick={onOpenProjects}
        >
          Projects
        </Button>
      </nav>
      <div css={headerActionsStyles(theme)}>
        <StatusMenu
          open={openMenu === 'status'}
          onOpenChange={(open) => setMenuOpen('status', open)}
          systemState={systemState}
          systemLabel={systemLabel}
          localCaptureState={localCaptureState}
          aiVideoState={aiVideoState}
          voiceCloudState={voiceCloudState}
        />
        <AccountMenu
          user={user}
          open={openMenu === 'account'}
          onOpenChange={(open) => setMenuOpen('account', open)}
          busy={accountBusy}
          projectContextActive={projectContextActive}
          onOpenVideos={onOpenVideos}
          onOpenCharacters={onOpenCharacters}
          onOpenOutfits={onOpenOutfits}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
};
