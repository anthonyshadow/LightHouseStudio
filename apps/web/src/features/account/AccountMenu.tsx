import { useTheme } from '@emotion/react';
import type { AuthenticatedUser } from '@studio/contracts';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../ui/primitives/Button';

interface AccountMenuProps {
  readonly user: AuthenticatedUser;
  readonly busy?: boolean | undefined;
  readonly onOpenVideos: () => void;
  readonly onOpenCharacters: () => void;
  readonly onOpenOutfits: () => void;
  readonly onLogout: () => void;
}

export const AccountMenu = ({
  user,
  busy = false,
  onOpenVideos,
  onOpenCharacters,
  onOpenOutfits,
  onLogout,
}: AccountMenuProps) => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

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
    setOpen(false);
    action();
  };

  return (
    <div ref={rootRef} css={{ position: 'relative', flex: '0 0 auto' }}>
      <Button
        ref={triggerRef}
        size="small"
        variant="quiet"
        aria-label={`${user.displayName} account menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        css={{ width: '2.75rem', padding: 0, borderRadius: '999px' }}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <span aria-hidden="true">{initials || 'U'}</span>
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
            insetInlineStart: 0,
            width: 'min(17rem, calc(100vw - 1rem))',
            display: 'grid',
            gap: theme.space.xxs,
            padding: theme.space.sm,
            border: `1px solid ${theme.colors.borderStrong}`,
            borderRadius: theme.radii.medium,
            background: theme.colors.overlaySurface,
            boxShadow: theme.shadows.lifted,
            '& > p': { margin: `0 0 ${theme.space.xs}`, color: theme.colors.textMuted },
            '& > button': { justifyContent: 'flex-start', width: '100%' },
          }}
        >
          <p>
            <strong css={{ display: 'block', color: theme.colors.text }}>{user.displayName}</strong>
            {user.login}
          </p>
          <Button role="menuitem" variant="quiet" onClick={() => run(onOpenVideos)}>
            Saved Videos
          </Button>
          <Button role="menuitem" variant="quiet" onClick={() => run(onOpenCharacters)}>
            Saved Characters
          </Button>
          <Button role="menuitem" variant="quiet" onClick={() => run(onOpenOutfits)}>
            Saved Outfits
          </Button>
          <Button role="menuitem" variant="danger" onClick={() => run(onLogout)}>
            Log out
          </Button>
        </div>
      ) : null}
    </div>
  );
};
