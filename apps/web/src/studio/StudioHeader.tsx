import { useTheme } from '@emotion/react';
import type { AuthenticatedSessionResponse, AuthenticatedUser } from '@studio/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountMenu } from '../features/account/AccountMenu';
import type { BrowserCapabilities, ProviderAvailability } from '../features/media-session';
import { liveExperienceAvailability } from './studioLiveAvailability';
import { deriveStudioAvailability, type CapabilityState } from './studioAvailabilityPresentation';
import { AppIcon, Button, type AppIconName } from '../ui';
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

export type { CapabilityState } from './studioAvailabilityPresentation';

type HeaderMenu = 'account' | 'create' | 'status';

export type StudioHeaderDestination = 'dashboard' | 'studio' | 'campaigns' | 'projects' | 'assets';

type StudioHeaderProps = {
  availability: ProviderAvailability;
  browser: BrowserCapabilities;
  capabilityState: CapabilityState;
  user: AuthenticatedUser;
  /** When provided, the account menu offers the read-only account details panel. */
  session?: AuthenticatedSessionResponse;
  accountBusy?: boolean;
  activeDestination: StudioHeaderDestination;
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
        <AppIcon name="plus" width="1.05rem" height="1.05rem" />
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
  session,
  accountBusy,
  activeDestination,
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
  const { enabled: liveEnabled } = liveExperienceAvailability(availability);
  const studioAvailability = deriveStudioAvailability({
    availability,
    browser,
    capabilityState,
  });
  const {
    systemState,
    systemLabel,
    localCaptureState,
    liveAiState,
    existingVideoAiState,
    voiceCloudState,
  } = studioAvailability;
  const setMenuOpen = useCallback((menu: HeaderMenu, open: boolean) => {
    setOpenMenu(open ? menu : null);
  }, []);
  // Studio is a destination like any other: without it the create surface — the product's main
  // one — is the only place the rail can never mark, so the operator loses their location there.
  const destinations = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', open: onOpenDashboard },
    { id: 'studio', label: 'Studio', icon: 'video', open: onOpenStudio },
    { id: 'projects', label: 'Projects', icon: 'projects', open: onOpenProjects },
    { id: 'campaigns', label: 'Campaigns', icon: 'campaigns', open: onOpenCampaigns },
    { id: 'assets', label: 'Assets', icon: 'assets', open: onOpenAssets },
  ] as const satisfies readonly {
    id: StudioHeaderDestination;
    label: string;
    icon: AppIconName;
    open: () => void;
  }[];

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
            <span>Studio</span>
          </div>
        </button>
        <nav aria-label="Primary" css={primaryNavigationStyles(theme)}>
          {destinations.map(({ id, label, icon, open }) => (
            <Button
              key={id}
              size="small"
              variant="quiet"
              aria-current={activeDestination === id ? 'page' : undefined}
              onClick={open}
            >
              <AppIcon data-nav-icon name={icon} />
              <span>{label}</span>
            </Button>
          ))}
        </nav>
        <div css={headerActionsStyles(theme)}>
          <div data-create-action>
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
          </div>
          <div data-utility-actions>
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
              presentation="rail"
              details={
                session
                  ? {
                      session,
                      capabilityRows: studioAvailability.rows,
                      capabilityFootnote: studioAvailability.footnote,
                    }
                  : undefined
              }
              onLogout={onLogout}
            />
          </div>
        </div>
      </header>
      <nav aria-label="Mobile primary" css={mobileNavigationStyles(theme)}>
        {destinations.map(({ id, label, icon, open }) => (
          <Button
            key={id}
            size="small"
            variant="quiet"
            aria-current={activeDestination === id ? 'page' : undefined}
            onClick={open}
          >
            <AppIcon name={icon} width="1.05rem" height="1.05rem" />
            <span>{label}</span>
          </Button>
        ))}
      </nav>
    </>
  );
};
