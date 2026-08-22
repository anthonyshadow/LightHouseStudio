import { useTheme } from '@emotion/react';
import type { AuthenticatedSessionResponse, AuthenticatedUser } from '@studio/contracts';
import { useRef, useState } from 'react';
import { Button } from '../../ui/primitives/Button';
import { useDismissiblePopover } from '../../ui/primitives/useDismissiblePopover';
import { useMenuKeyboardNavigation } from '../../ui/primitives/useMenuKeyboardNavigation';
import { AccountPanel, type AccountCapabilityRow } from './AccountPanel';
import { media } from '../../ui/media';

/** Everything the read-only account panel shows; all of it already lives in memory. */
export interface AccountDetailsSource {
  readonly session: AuthenticatedSessionResponse;
  readonly capabilityRows: readonly AccountCapabilityRow[];
  readonly capabilityFootnote: string;
}

interface AccountMenuProps {
  readonly user: AuthenticatedUser;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly busy?: boolean | undefined;
  readonly presentation?: 'header' | 'rail';
  /** When provided, the menu offers a read-only "Account details" panel above Log out. */
  readonly details?: AccountDetailsSource | undefined;
  readonly onLogout: () => void;
}

export const AccountMenu = ({
  user,
  open,
  onOpenChange,
  busy = false,
  presentation = 'header',
  details,
  onLogout,
}: AccountMenuProps) => {
  const theme = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useDismissiblePopover({ open, onOpenChange, rootRef, triggerRef });
  const handleMenuKeyDown = useMenuKeyboardNavigation(menuRef, open);

  const initials = user.displayName
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const railPresentation = presentation === 'rail';
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };
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
        '& [data-account-label]': {
          fontSize: theme.fontSizes.metadata,
          whiteSpace: 'nowrap',
        },
        [media.down('tablet')]: {
          '& > button': { width: '2.75rem', padding: 0 },
          '& [data-account-label]': { display: 'none' },
        },
        ...(railPresentation
          ? {
              [media.up('compact')]: {
                width: '100%',
                '& > button': {
                  width: '100%',
                  height: 'auto',
                  minHeight: '2.75rem',
                  justifyContent: 'flex-start',
                  padding: theme.space.xxs,
                  borderColor: 'transparent',
                  borderRadius: theme.radii.small,
                  background: 'transparent',
                  '&:hover:not(:disabled):not([aria-disabled="true"])': {
                    borderColor: 'transparent',
                    background: theme.colors.surfaceSoft,
                  },
                },
                '& [data-account-initials]': {
                  width: '2rem',
                  height: '2rem',
                  flex: '0 0 auto',
                  display: 'grid',
                  placeItems: 'center',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radii.round,
                  background: theme.colors.surfaceStrong,
                  fontSize: theme.fontSizes.caption,
                },
                '& [data-account-label]': {
                  minWidth: 0,
                  display: 'grid',
                  gap: '0.08rem',
                  textAlign: 'start',
                },
                '& [data-account-label] strong': {
                  overflow: 'hidden',
                  color: theme.colors.text,
                  fontSize: theme.fontSizes.caption,
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
                '& [data-account-label] small': {
                  color: theme.colors.textFaint,
                  fontSize: '0.65rem',
                  fontWeight: 650,
                },
              },
              [media.down('compact')]: {
                '& > button': { width: '2.75rem', padding: 0 },
                '& [data-account-label]': { display: 'none' },
              },
            }
          : {}),
      }}
    >
      <Button
        ref={triggerRef}
        size="small"
        variant="quiet"
        aria-label={`${user.displayName} account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          onOpenChange(true);
        }}
      >
        <span data-account-initials aria-hidden="true">
          {initials || 'U'}
        </span>
        <span data-account-label aria-hidden="true">
          {railPresentation ? (
            <>
              <strong>{user.displayName}</strong>
              <small>Account</small>
            </>
          ) : (
            'Account'
          )}
        </span>
      </Button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-label="Account"
          onKeyDown={handleMenuKeyDown}
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
              borderBottom: `1px solid ${theme.colors.divider}`,
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes.metadata,
              lineHeight: 1.45,
            },
            '& > button': { justifyContent: 'flex-start', width: '100%' },
            '& > button[role="menuitem"]': { minHeight: '2.75rem' },
            '& > button[aria-current="page"]': {
              color: theme.colors.text,
              background: theme.colors.accentSoft,
            },
            '& > button[data-logout]': {
              marginBlockStart: theme.space.xs,
              borderTop: `1px solid ${theme.colors.divider}`,
              borderRadius: theme.radii.small,
            },
            [media.down('tablet')]: {
              position: 'fixed',
              insetBlockStart: '4rem',
              insetInline: theme.space.xs,
              width: 'auto',
              maxHeight: 'calc(100dvh - 4.5rem)',
              overflowY: 'auto',
            },
            ...(railPresentation
              ? {
                  [media.up('compact')]: {
                    insetBlockStart: 'auto',
                    insetBlockEnd: 0,
                    insetInlineStart: `calc(100% + ${theme.space.sm})`,
                    insetInlineEnd: 'auto',
                  },
                  [media.down('compact')]: {
                    position: 'fixed',
                    insetBlockStart: '4rem',
                    insetInline: theme.space.xs,
                    width: 'auto',
                    maxHeight: 'calc(100dvh - 4.5rem)',
                    overflowY: 'auto',
                  },
                }
              : {}),
          }}
        >
          <p data-account-identity>
            <strong css={{ display: 'block', color: theme.colors.text }}>{user.displayName}</strong>
            {user.login}
          </p>
          {details ? (
            <Button role="menuitem" variant="quiet" onClick={() => run(() => setDetailsOpen(true))}>
              Account details
            </Button>
          ) : null}
          <Button data-logout role="menuitem" variant="danger" onClick={() => run(onLogout)}>
            Log out
          </Button>
        </div>
      ) : null}
      {details ? (
        <AccountPanel
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          returnFocusRef={triggerRef}
          session={details.session}
          capabilityRows={details.capabilityRows}
          capabilityFootnote={details.capabilityFootnote}
        />
      ) : null}
    </div>
  );
};
