// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import {
  OverlayPanel,
  type OverlayPanelBodyMode,
  type OverlayPanelInitialFocus,
} from './OverlayPanel';

afterEach(() => {
  cleanup();
  document.body.style.removeProperty('overflow');
  document.querySelectorAll('[data-test-fullscreen-host]').forEach((element) => element.remove());
  Reflect.deleteProperty(document, 'fullscreenElement');
});

interface HarnessProps {
  onClose?: () => void;
  onUnderlayClick?: () => void;
  closeOnBackdrop?: boolean;
  closeDisabled?: boolean;
  bodyMode?: OverlayPanelBodyMode;
  initialFocus?: OverlayPanelInitialFocus;
}

const Harness = ({
  onClose = vi.fn(),
  onUnderlayClick = vi.fn(),
  closeOnBackdrop = true,
  closeDisabled = false,
  bodyMode = 'scroll',
  initialFocus = 'first-focusable',
}: HarnessProps) => {
  const [open, setOpen] = useState(false);

  return (
    <StudioDesignProvider>
      <button type="button" onClick={() => setOpen(true)}>
        Open tools
      </button>
      <button type="button" onClick={onUnderlayClick}>
        Underlay action
      </button>
      <OverlayPanel
        open={open}
        title="Studio tools"
        description="Choose a contained tool."
        footer={<button type="button">Apply</button>}
        closeOnBackdrop={closeOnBackdrop}
        closeDisabled={closeDisabled}
        bodyMode={bodyMode}
        initialFocus={initialFocus}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <button type="button">First action</button>
      </OverlayPanel>
    </StudioDesignProvider>
  );
};

const NestedHarness = ({
  onParentClose,
  onChildClose,
}: {
  onParentClose: () => void;
  onChildClose: () => void;
}) => {
  const [parentOpen, setParentOpen] = useState(false);
  const [childOpen, setChildOpen] = useState(false);

  return (
    <StudioDesignProvider>
      <button type="button" onClick={() => setParentOpen(true)}>
        Open parent
      </button>
      <OverlayPanel
        open={parentOpen}
        title="Parent tools"
        onClose={() => {
          onParentClose();
          setParentOpen(false);
        }}
      >
        <button type="button" onClick={() => setChildOpen(true)}>
          Open child
        </button>
      </OverlayPanel>
      <OverlayPanel
        open={childOpen}
        title="Child tools"
        onClose={() => {
          onChildClose();
          setChildOpen(false);
        }}
      >
        <button type="button">Child action</button>
      </OverlayPanel>
    </StudioDesignProvider>
  );
};

const FocusHarness = () => {
  const [open, setOpen] = useState(false);
  const hiddenInitialRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement>(null);

  return (
    <StudioDesignProvider>
      <button ref={returnFocusRef} type="button">
        Explicit return target
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        Open focus panel
      </button>
      <OverlayPanel
        open={open}
        title="Focus panel"
        initialFocusRef={hiddenInitialRef}
        returnFocusRef={returnFocusRef}
        onClose={() => setOpen(false)}
      >
        <div style={{ display: 'none' }}>
          <button ref={hiddenInitialRef} type="button">
            Hidden initial action
          </button>
        </div>
        <div aria-hidden="true">
          <button type="button">Aria hidden action</button>
        </div>
        <div ref={(node) => node?.setAttribute('inert', '')}>
          <button type="button">Inert action</button>
        </div>
        <button type="button">Visible last action</button>
      </OverlayPanel>
    </StudioDesignProvider>
  );
};

describe('OverlayPanel', () => {
  it('traps focus, closes only the topmost dialog with Escape, and restores the opener after exit', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const opener = screen.getByRole('button', { name: 'Open tools' });
    await user.click(opener);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close panel' })).toHaveFocus());
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog', { name: 'Studio tools' })).toBeInTheDocument();
    expect(screen.getByRole('dialog').parentElement).toHaveAttribute(
      'data-overlay-state',
      'exiting',
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('intercepts backdrop pointer and click events without closing for panel interactions or clicking through', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onUnderlayClick = vi.fn();
    render(<Harness onClose={onClose} onUnderlayClick={onUnderlayClick} />);

    const opener = screen.getByRole('button', { name: 'Open tools' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog');
    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();

    fireEvent.pointerDown(dialog);
    expect(onClose).not.toHaveBeenCalled();

    if (backdrop) {
      fireEvent.pointerDown(backdrop);
      fireEvent.pointerUp(backdrop);
      fireEvent.click(backdrop);
    }

    expect(onClose).toHaveBeenCalledOnce();
    expect(onUnderlayClick).not.toHaveBeenCalled();
    expect(backdrop).toBeInTheDocument();
    await waitFor(() => expect(backdrop).not.toBeInTheDocument());
  });

  it('keeps a non-dismissible backdrop intercepting events', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} closeOnBackdrop={false} />);

    await user.click(screen.getByRole('button', { name: 'Open tools' }));
    const backdrop = screen.getByRole('dialog').parentElement;
    expect(backdrop).not.toBeNull();
    if (backdrop) fireEvent.pointerDown(backdrop);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('guards every close affordance during an atomic operation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} closeDisabled />);

    await user.click(screen.getByRole('button', { name: 'Open tools' }));
    const closeButton = screen.getByRole('button', { name: 'Close panel' });
    expect(closeButton).toBeDisabled();
    await user.keyboard('{Escape}');
    const backdrop = screen.getByRole('dialog').parentElement;
    if (backdrop) fireEvent.pointerDown(backdrop);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('isolates underlying dialogs and lets only the topmost dialog dismiss', async () => {
    const user = userEvent.setup();
    const onParentClose = vi.fn();
    const onChildClose = vi.fn();
    render(<NestedHarness onParentClose={onParentClose} onChildClose={onChildClose} />);

    await user.click(screen.getByRole('button', { name: 'Open parent' }));
    const childOpener = screen.getByRole('button', { name: 'Open child' });
    const parentHeading = screen.getByRole('heading', { name: 'Parent tools' });
    const parentDialog = parentHeading.closest<HTMLElement>('[role="dialog"]');
    expect(parentDialog).not.toBeNull();

    await user.click(childOpener);
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Child tools' })).toBeInTheDocument(),
    );
    expect(parentDialog).toHaveAttribute('aria-hidden', 'true');
    expect(parentDialog).toHaveAttribute('inert');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onChildClose).toHaveBeenCalledOnce();
    expect(onParentClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onParentClose).not.toHaveBeenCalled();

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Child tools' })).not.toBeInTheDocument(),
    );
    expect(parentDialog).not.toHaveAttribute('aria-hidden');
    expect(parentDialog).not.toHaveAttribute('inert');
    expect(childOpener).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onParentClose).toHaveBeenCalledOnce();
  });

  it('restores exact app-root isolation and body overflow only after the exit completes', async () => {
    const user = userEvent.setup();
    const result = render(<Harness />);
    result.container.setAttribute('aria-hidden', 'false');
    document.body.style.setProperty('overflow', 'clip', 'important');

    const opener = screen.getByRole('button', { name: 'Open tools' });
    await user.click(opener);
    expect(result.container).toHaveAttribute('aria-hidden', 'true');
    expect(result.container).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(result.container).toHaveAttribute('aria-hidden', 'true');
    expect(result.container).toHaveAttribute('inert');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(result.container).toHaveAttribute('aria-hidden', 'false');
    expect(result.container).not.toHaveAttribute('inert');
    expect(document.body.style.getPropertyValue('overflow')).toBe('clip');
    expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
  });

  it('rejects hidden and inert initial focus targets and excludes them from focus wrapping', async () => {
    const user = userEvent.setup();
    render(<FocusHarness />);

    await user.click(screen.getByRole('button', { name: 'Open focus panel' }));
    const closeButton = screen.getByRole('button', { name: 'Close panel' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(screen.getByRole('button', { name: 'Visible last action' })).toHaveFocus();

    await user.click(closeButton);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Explicit return target' })).toHaveFocus();
  });

  it('supports caller-owned scrolling with contained body mode', async () => {
    const user = userEvent.setup();
    render(<Harness bodyMode="contained" />);

    await user.click(screen.getByRole('button', { name: 'Open tools' }));
    const body = document.querySelector<HTMLElement>('[data-overlay-body-mode="contained"]');
    expect(body).not.toBeNull();
    expect(body).toHaveStyle({ overflow: 'hidden' });
  });

  it('renders caller actions in the panel header', () => {
    render(
      <StudioDesignProvider>
        <OverlayPanel
          open
          title="Asset library"
          headerActions={<button type="button">Characters</button>}
          onClose={vi.fn()}
        >
          Asset contents
        </OverlayPanel>
      </StudioDesignProvider>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Asset library' });
    expect(within(dialog).getByRole('button', { name: 'Characters' })).toBeInTheDocument();
  });

  it('portals into the active fullscreen element without isolating its ancestor', async () => {
    const fullscreenHost = document.createElement('section');
    fullscreenHost.setAttribute('data-test-fullscreen-host', '');
    document.body.append(fullscreenHost);
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: fullscreenHost,
    });

    const result = render(
      <StudioDesignProvider>
        <OverlayPanel open title="Fullscreen tools" onClose={vi.fn()}>
          Panel content
        </OverlayPanel>
      </StudioDesignProvider>,
    );

    expect(fullscreenHost).toContainElement(
      screen.getByRole('dialog', { name: 'Fullscreen tools' }),
    );
    expect(fullscreenHost).not.toHaveAttribute('aria-hidden');
    expect(fullscreenHost).not.toHaveAttribute('inert');
    expect(result.container).toHaveAttribute('aria-hidden', 'true');

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
    fireEvent(document, new Event('fullscreenchange'));

    await waitFor(() =>
      expect(document.body.querySelector(':scope > [data-overlay-panel-root]')).toBeInTheDocument(),
    );
  });

  it('can place initial focus on the dialog heading', async () => {
    const user = userEvent.setup();
    render(<Harness initialFocus="heading" />);

    await user.click(screen.getByRole('button', { name: 'Open tools' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Studio tools' })).toHaveFocus(),
    );
  });

  it('skips the exit delay when reduced motion is requested', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Open tools' }));
    await user.click(screen.getByRole('button', { name: 'Close panel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
