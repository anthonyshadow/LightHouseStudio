import { useTheme } from '@emotion/react';
import type { AuthenticatedSessionResponse, AuthenticatedUser } from '@studio/contracts';
import { useCallback, useRef, useState } from 'react';
import { AccountMenu } from '../features/account/AccountMenu';
import type { BrowserCapabilities, ProviderAvailability } from '../features/media-session';
import { liveExperienceAvailability } from './studioLiveAvailability';
import {
  deriveStudioAvailability,
  type CapabilityState,
  type StudioAvailabilityPresentation,
} from './studioAvailabilityPresentation';
import { AppIcon, Button, type AppIconName } from '../ui';
import { useDismissiblePopover } from '../ui/primitives/useDismissiblePopover';
import { useMenuKeyboardNavigation } from '../ui/primitives/useMenuKeyboardNavigation';
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
import { media } from '../ui/media';

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
  /** Opens the static "How Lightframe works" explainer; the trigger takes focus back on close. */
  onOpenHelp: (trigger: HTMLButtonElement | null) => void;
  onLogout: () => void;
};

type StatusMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availability: StudioAvailabilityPresentation;
};

const StatusMenu = ({ open, onOpenChange, availability }: StatusMenuProps) => {
  const theme = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useDismissiblePopover({ open, onOpenChange, rootRef, triggerRef });

  return (
    <div ref={rootRef} css={capabilityStyles(theme)} aria-label="Integration availability">
      <button
        ref={triggerRef}
        type="button"
        aria-label={availability.systemLabel}
        aria-expanded={open}
        aria-controls="studio-availability-details"
        onClick={() => onOpenChange(!open)}
      >
        <span css={systemStatusDotStyles(theme, availability.systemState)} aria-hidden="true" />
        <span data-system-label>{availability.systemLabel}</span>
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
          {availability.rows.map((row) => (
            <span key={row.id}>
              {row.label} <strong>{row.state}</strong>
            </span>
          ))}
          <small>{availability.footnote}</small>
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
  const handleMenuKeyDown = useMenuKeyboardNavigation(menuRef, open);

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
          onKeyDown={handleMenuKeyDown}
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
  onOpenHelp,
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
  const setMenuOpen = useCallback((menu: HeaderMenu, open: boolean) => {
    setOpenMenu(open ? menu : null);
  }, []);
  /*
   * Studio is a destination like any other: without it the create surface — the product's main
   * one — is the only place the rail can never mark, so the operator loses their location there.
   *
   * Assets is the exception, and only on a compact layout. It is not a place you work; it is a
   * shelf you open over the place you are working, and it closes back to it. A phone's bottom bar
   * has room for the four surfaces you actually stand on, and the Dashboard carries the way in to
   * the shelf — which is where you already are when you go looking for saved work.
   */
  const destinations = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
      open: onOpenDashboard,
      compact: true,
    },
    { id: 'studio', label: 'Studio', icon: 'video', open: onOpenStudio, compact: true },
    { id: 'projects', label: 'Projects', icon: 'projects', open: onOpenProjects, compact: true },
    {
      id: 'campaigns',
      label: 'Campaigns',
      icon: 'campaigns',
      open: onOpenCampaigns,
      compact: true,
    },
    { id: 'assets', label: 'Assets', icon: 'assets', open: onOpenAssets, compact: false },
  ] as const satisfies readonly {
    id: StudioHeaderDestination;
    label: string;
    icon: AppIconName;
    open: () => void;
    /** Whether the compact bottom bar carries it, or only the rail does. */
    compact: boolean;
  }[];
  const compactDestinations = destinations.filter(({ compact }) => compact);

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
            <Button
              size="small"
              variant="quiet"
              aria-label="How Lightframe works"
              css={{
                gap: theme.space.xs,
                [media.up('compact')]: { justifyContent: 'flex-start' },
                [media.down('tablet')]: {
                  width: '2.75rem',
                  padding: 0,
                  '& [data-help-label]': { display: 'none' },
                },
              }}
              onClick={(event) => onOpenHelp(event.currentTarget)}
            >
              <AppIcon name="info" width="1.05rem" height="1.05rem" />
              <span data-help-label>Help</span>
            </Button>
            <StatusMenu
              open={openMenu === 'status'}
              onOpenChange={(open) => setMenuOpen('status', open)}
              availability={studioAvailability}
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
        {compactDestinations.map(({ id, label, icon, open }) => (
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
