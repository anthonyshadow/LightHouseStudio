import { useTheme } from '@emotion/react';
import type { AuthenticatedUser } from '@studio/contracts';
import { useEffect, useRef } from 'react';
import { Button } from '../../ui/primitives/Button';
import { useDismissiblePopover } from '../../ui/primitives/useDismissiblePopover';

interface AccountMenuProps {
  readonly user: AuthenticatedUser;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly busy?: boolean | undefined;
  readonly projectContextActive?: boolean | undefined;
  readonly activeLibrary?: 'videos' | 'characters' | 'outfits' | undefined;
  readonly onOpenVideos: () => void;
  readonly onOpenCharacters: () => void;
  readonly onOpenOutfits: () => void;
  readonly onLogout: () => void;
}

export const AccountMenu = ({
  user,
  open,
  onOpenChange,
  busy = false,
  projectContextActive = false,
  activeLibrary,
  onOpenVideos,
  onOpenCharacters,
  onOpenOutfits,
  onLogout,
}: AccountMenuProps) => {
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

  const initials = user.displayName
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };
  const libraryItems = [
    { id: 'videos', label: 'Saved Videos', open: onOpenVideos },
    { id: 'characters', label: 'Saved Characters', open: onOpenCharacters },
    { id: 'outfits', label: 'Saved Outfits', open: onOpenOutfits },
  ] as const;

  return (
    <div
      ref={rootRef}
      css={{
        position: 'relative',
        flex: '0 0 auto',
        '& > button': {
          width: 'auto',
          minWidth: '2.75rem',
          height: '2.75rem',
          gap: theme.space.xs,
          paddingInline: theme.space.sm,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.round,
          color: theme.colors.text,
          background: theme.colors.surface,
          fontWeight: 820,
          '&:hover:not(:disabled):not([aria-disabled="true"])': {
            borderColor: theme.colors.accent,
            background: theme.colors.surfaceStrong,
          },
        },
        '& > button[data-library-active="true"]': {
          borderColor: theme.colors.accent,
          background: theme.colors.accentSoft,
        },
        '& [data-library-label]': {
          fontSize: theme.fontSizes.metadata,
          whiteSpace: 'nowrap',
        },
        '@media (max-width: 39.99rem)': {
          '& > button': { width: '2.75rem', padding: 0 },
          '& [data-library-label]': { display: 'none' },
        },
      }}
    >
      <Button
        ref={triggerRef}
        size="small"
        variant="quiet"
        aria-label={`${user.displayName} account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-library-active={activeLibrary !== undefined}
        disabled={busy}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          onOpenChange(true);
        }}
      >
        <span aria-hidden="true">{initials || 'U'}</span>
        <span data-library-label aria-hidden="true">
          Libraries
        </span>
      </Button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-label="Account and saved libraries"
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
          css={{
            position: 'absolute',
            zIndex: theme.layers.overlay,
            insetBlockStart: 'calc(100% + .45rem)',
            insetInlineEnd: 0,
            width: 'min(17rem, calc(100vw - 1rem))',
            display: 'grid',
            gap: theme.space.xxs,
            padding: theme.space.sm,
            border: `1px solid ${theme.colors.borderStrong}`,
            borderRadius: theme.radii.large,
            background: theme.colors.overlaySurface,
            boxShadow: theme.shadows.lifted,
            '& [data-account-identity]': {
              margin: 0,
              padding: `${theme.space.xs} ${theme.space.sm} ${theme.space.sm}`,
              borderBottom: `1px solid ${theme.colors.border}`,
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes.metadata,
              lineHeight: 1.45,
            },
            '& [data-menu-section-label]': {
              padding: `${theme.space.xs} ${theme.space.sm} ${theme.space.xxs}`,
              color: theme.colors.textFaint,
              fontSize: theme.fontSizes.caption,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            },
            '& > button': { justifyContent: 'flex-start', width: '100%' },
            '& > button[role="menuitem"]': { minHeight: '2.75rem' },
            '& > button[aria-current="page"]': {
              color: theme.colors.text,
              background: theme.colors.accentSoft,
            },
            '& > button[data-logout]': {
              marginBlockStart: theme.space.xs,
              borderTop: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.small,
            },
            '@media (max-width: 39.99rem)': {
              position: 'fixed',
              insetBlockStart: '4rem',
              insetInline: theme.space.xs,
              width: 'auto',
              maxHeight: 'calc(100dvh - 4.5rem)',
              overflowY: 'auto',
            },
          }}
        >
          <p data-account-identity>
            <strong css={{ display: 'block', color: theme.colors.text }}>{user.displayName}</strong>
            {user.login}
          </p>
          <span role="presentation" data-menu-section-label>
            {projectContextActive ? 'Global libraries · exits Project' : 'Saved libraries'}
          </span>
          {libraryItems.map(({ id, label, open: openLibrary }) => (
            <Button
              key={id}
              role="menuitem"
              variant="quiet"
              aria-label={projectContextActive ? `${label} (exits Project)` : undefined}
              aria-current={activeLibrary === id ? 'page' : undefined}
              onClick={() => run(openLibrary)}
            >
              {label}
            </Button>
          ))}
          <Button data-logout role="menuitem" variant="danger" onClick={() => run(onLogout)}>
            Log out
          </Button>
        </div>
      ) : null}
    </div>
  );
};
