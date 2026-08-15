import { useTheme } from '@emotion/react';
import type { AuthenticatedUser } from '@studio/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountMenu } from '../features/account/AccountMenu';
import type { BrowserCapabilities, ProviderAvailability } from '../features/media-session';
import { Button } from '../ui';
import { useDismissiblePopover } from '../ui/primitives/useDismissiblePopover';
import {
  brandStyles,
  capabilityDetailStyles,
  capabilityStyles,
  createMenuStyles,
  headerActionsStyles,
  headerStyles,
  mobileNavigationStyles,
  primaryNavigationStyles,
  systemStatusDotStyles,
} from './StudioApp.styles';

export type CapabilityState = 'loading' | 'ready' | 'error';

type HeaderMenu = 'account' | 'create' | 'status';

export type StudioHeaderDestination = 'dashboard' | 'studio' | 'campaigns' | 'projects' | 'assets';

type StudioHeaderProps = {
  availability: ProviderAvailability;
  browser: BrowserCapabilities;
  capabilityState: CapabilityState;
  user: AuthenticatedUser;
  accountBusy?: boolean;
  activeDestination: StudioHeaderDestination;
  organizationRouteActive?: boolean;
  onOpenDashboard: () => void;
  onOpenStudio: () => void;
  onOpenProjects: () => void;
  onOpenCampaigns: () => void;
  onOpenAssets: () => void;
  onCreateProject: () => void;
  onCreateCampaign: () => void;
  onCreateAsset: (trigger: HTMLButtonElement | null) => void;
  onOpenLive: () => void;
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
  localCaptureAvailable: boolean,
): string => {
  if (capabilityState === 'loading') return 'Checking integrations';
  if (capabilityState === 'error') return 'Integration status unavailable';
  return localCaptureAvailable ? 'Core Studio ready' : 'Studio limited';
};

type StatusMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemState: 'loading' | 'ready' | 'limited';
  systemLabel: string;
  localCaptureState: string;
  liveAiState: string;
  existingVideoAiState: string;
  voiceCloudState: string;
};

const StatusMenu = ({
  open,
  onOpenChange,
  systemState,
  systemLabel,
  localCaptureState,
  liveAiState,
  existingVideoAiState,
  voiceCloudState,
}: StatusMenuProps) => {
  const theme = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useDismissiblePopover({ open, onOpenChange, rootRef, triggerRef });

  return (
    <div ref={rootRef} css={capabilityStyles(theme)} aria-label="Integration availability">
      <button
        ref={triggerRef}
        type="button"
        aria-label={systemLabel}
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
            <span>Local support and configured integrations</span>
          </div>
          <span>
            Local capture <strong>{localCaptureState}</strong>
          </span>
          <span>
            Existing-video AI <strong>{existingVideoAiState}</strong>
          </span>
          <span>
            Live AI Beta <strong>{liveAiState}</strong>
          </span>
          <span>
            Voice cloud <strong>{voiceCloudState}</strong>
          </span>
          <small>Configuration does not verify live provider health.</small>
        </div>
      ) : null}
    </div>
  );
};

type CreateMenuProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liveEnabled: boolean;
  onCreateVideo: () => void;
  onCreateProject: () => void;
  onCreateCampaign: () => void;
  onCreateAsset: (trigger: HTMLButtonElement | null) => void;
  onOpenLive: () => void;
}>;

const CreateMenu = ({
  open,
  onOpenChange,
  liveEnabled,
  onCreateVideo,
  onCreateProject,
  onCreateCampaign,
  onCreateAsset,
  onOpenLive,
}: CreateMenuProps) => {
  const theme = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissiblePopover({ open, onOpenChange, rootRef, triggerRef });

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
  }, [open]);

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <div ref={rootRef} css={createMenuStyles(theme)}>
      <Button
        ref={triggerRef}
        size="small"
        variant="primary"
        aria-label="Quick Create"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span aria-hidden="true">＋</span>
        <span data-create-label-long>Quick Create</span>
      </Button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-label="Quick Create"
          data-create-menu
          onKeyDown={(event) => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            const items = [
              ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
            ];
            if (items.length === 0) return;
            event.preventDefault();
            const current = items.indexOf(document.activeElement as HTMLElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : event.key === 'ArrowDown'
                    ? (current + 1 + items.length) % items.length
                    : (current - 1 + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          <Button role="menuitem" variant="quiet" onClick={() => run(onCreateVideo)}>
            New video
          </Button>
          <Button role="menuitem" variant="quiet" onClick={() => run(onCreateProject)}>
            New Project
          </Button>
          <Button role="menuitem" variant="quiet" onClick={() => run(onCreateCampaign)}>
            New Campaign
          </Button>
          <Button
            role="menuitem"
            variant="quiet"
            onClick={() => run(() => onCreateAsset(triggerRef.current))}
          >
            Create Asset
          </Button>
          {liveEnabled ? (
            <Button role="menuitem" variant="quiet" onClick={() => run(onOpenLive)}>
              Live AI · Beta
            </Button>
          ) : null}
          <small>Projects and Campaigns are optional. Start with a standalone video anytime.</small>
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
  organizationRouteActive = false,
  onOpenDashboard,
  onOpenStudio,
  onOpenProjects,
  onOpenCampaigns,
  onOpenAssets,
  onCreateProject,
  onCreateCampaign,
  onCreateAsset,
  onOpenLive,
  onLogout,
}: StudioHeaderProps) => {
  const theme = useTheme();
  const [openMenu, setOpenMenu] = useState<HeaderMenu | null>(null);
  const localCaptureAvailable = browser.mediaDevices && browser.secureContext;
  const localCaptureState = localCaptureAvailable ? 'available' : 'unavailable';
  const liveBetaEnabled = availability.realtimeBetaEnabled === true;
  const liveProviderConfigured = availability.realtimeProviderConfigured ?? availability.decart;
  const liveEnabled = liveBetaEnabled && liveProviderConfigured && availability.decart;
  const liveAiState =
    capabilityState === 'loading'
      ? 'checking'
      : !liveBetaEnabled
        ? 'disabled'
        : liveProviderConfigured
          ? 'enabled'
          : 'not configured';
  const existingVideoAiState = capabilityLabel(
    capabilityState,
    Boolean(
      availability.videoProcessing?.characterSwap.available ||
      availability.videoProcessing?.virtualTryOn.available,
    ),
    'not configured',
  );
  const voiceCloudState = capabilityLabel(
    capabilityState,
    availability.elevenLabs,
    'not configured (optional)',
  );
  const systemState =
    capabilityState === 'loading'
      ? 'loading'
      : capabilityState === 'error' || !localCaptureAvailable
        ? 'limited'
        : 'ready';
  const systemLabel = systemStatusLabel(capabilityState, localCaptureAvailable);
  const setMenuOpen = useCallback((menu: HeaderMenu, open: boolean) => {
    setOpenMenu(open ? menu : null);
  }, []);
  const destinations = [
    { id: 'dashboard', label: 'Dashboard', open: onOpenDashboard },
    { id: 'projects', label: 'Projects', open: onOpenProjects },
    { id: 'campaigns', label: 'Campaigns', open: onOpenCampaigns },
    { id: 'assets', label: 'Assets', open: onOpenAssets },
  ] as const;

  return (
    <>
      <header css={headerStyles(theme)}>
        <button
          type="button"
          aria-label="Open Lightframe Dashboard"
          css={brandStyles(theme)}
          onClick={onOpenDashboard}
        >
          <img src="/favicon.svg" alt="" width="38" height="38" />
          <div>
            <strong>Lightframe</strong>
            <span>Local-first studio</span>
          </div>
        </button>
        <nav aria-label="Primary" css={primaryNavigationStyles(theme)}>
          {destinations.map(({ id, label, open }) => (
            <Button
              key={id}
              size="small"
              variant="quiet"
              aria-current={activeDestination === id ? 'page' : undefined}
              onClick={open}
            >
              {label}
            </Button>
          ))}
        </nav>
        <div css={headerActionsStyles(theme)}>
          <CreateMenu
            open={openMenu === 'create'}
            onOpenChange={(open) => setMenuOpen('create', open)}
            liveEnabled={liveEnabled}
            onCreateVideo={onOpenStudio}
            onCreateProject={onCreateProject}
            onCreateCampaign={onCreateCampaign}
            onCreateAsset={onCreateAsset}
            onOpenLive={onOpenLive}
          />
          <StatusMenu
            open={openMenu === 'status'}
            onOpenChange={(open) => setMenuOpen('status', open)}
            systemState={systemState}
            systemLabel={systemLabel}
            localCaptureState={localCaptureState}
            liveAiState={liveAiState}
            existingVideoAiState={existingVideoAiState}
            voiceCloudState={voiceCloudState}
          />
          <AccountMenu
            user={user}
            open={openMenu === 'account'}
            onOpenChange={(open) => setMenuOpen('account', open)}
            busy={accountBusy}
            onLogout={onLogout}
          />
        </div>
      </header>
      {organizationRouteActive ? (
        <nav aria-label="Mobile primary" css={mobileNavigationStyles(theme)}>
          {destinations.map(({ id, label, open }) => (
            <Button
              key={id}
              size="small"
              variant="quiet"
              aria-current={activeDestination === id ? 'page' : undefined}
              onClick={open}
            >
              {label}
            </Button>
          ))}
        </nav>
      ) : null}
    </>
  );
};
