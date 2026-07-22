interface OverlayStackEntry {
  readonly id: string;
  readonly root: HTMLElement;
}

interface IsolationSnapshot {
  readonly hadAriaHidden: boolean;
  readonly ariaHidden: string | null;
  readonly hadInertAttribute: boolean;
  readonly inertAttribute: string | null;
  readonly inertProperty: boolean;
}

const overlayStack: OverlayStackEntry[] = [];
const isolationSnapshots = new Map<HTMLElement, IsolationSnapshot>();
let unlockedBodyOverflow: { value: string; priority: string } | null = null;

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'audio[controls]',
  'video[controls]',
  'details > summary:first-of-type',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const hasInertState = (element: HTMLElement): boolean => {
  const inertElement = element as HTMLElement & { inert?: boolean };
  return element.hasAttribute('inert') || inertElement.inert === true;
};

const isHiddenOrInert = (element: HTMLElement, boundary?: HTMLElement): boolean => {
  let current: HTMLElement | null = element;

  while (current) {
    if (
      current.hidden ||
      current.getAttribute('aria-hidden') === 'true' ||
      hasInertState(current)
    ) {
      return true;
    }

    const styles = window.getComputedStyle(current);
    if (
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.visibility === 'collapse'
    ) {
      return true;
    }

    if (current === boundary) break;
    current = current.parentElement;
  }

  return false;
};

export const isFocusableElement = (element: HTMLElement, boundary: HTMLElement): boolean => {
  if (!element.matches(focusableSelector) || element.matches(':disabled')) return false;
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
  if (element.hasAttribute('tabindex') && element.tabIndex < 0) return false;

  const closedDetails = element.closest('details:not([open])');
  if (closedDetails && closedDetails.querySelector(':scope > summary') !== element) return false;

  return !isHiddenOrInert(element, boundary);
};

export const getFocusableElements = (container: HTMLElement): readonly HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) =>
    isFocusableElement(element, container),
  );

const snapshotIsolation = (element: HTMLElement): IsolationSnapshot => {
  const inertElement = element as HTMLElement & { inert?: boolean };
  return {
    hadAriaHidden: element.hasAttribute('aria-hidden'),
    ariaHidden: element.getAttribute('aria-hidden'),
    hadInertAttribute: element.hasAttribute('inert'),
    inertAttribute: element.getAttribute('inert'),
    inertProperty: inertElement.inert === true,
  };
};

const isolateElement = (element: HTMLElement): void => {
  if (!isolationSnapshots.has(element)) {
    isolationSnapshots.set(element, snapshotIsolation(element));
  }

  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('inert', '');
  (element as HTMLElement & { inert?: boolean }).inert = true;
};

const restoreIsolatedElement = (element: HTMLElement): void => {
  const snapshot = isolationSnapshots.get(element);
  if (!snapshot) return;

  const inertElement = element as HTMLElement & { inert?: boolean };
  inertElement.inert = snapshot.inertProperty;

  if (snapshot.hadInertAttribute) {
    element.setAttribute('inert', snapshot.inertAttribute ?? '');
  } else {
    element.removeAttribute('inert');
  }

  if (snapshot.hadAriaHidden) {
    element.setAttribute('aria-hidden', snapshot.ariaHidden ?? '');
  } else {
    element.removeAttribute('aria-hidden');
  }

  isolationSnapshots.delete(element);
};

const isBackgroundElement = (element: Element): element is HTMLElement =>
  element instanceof HTMLElement &&
  !['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'].includes(element.tagName);

const synchronizeModalIsolation = (): void => {
  const topmost = overlayStack.at(-1);
  const targets = new Set<HTMLElement>();

  if (topmost) {
    for (const child of Array.from(document.body.children)) {
      if (child !== topmost.root && isBackgroundElement(child)) targets.add(child);
    }

    for (const entry of overlayStack) {
      if (entry === topmost) continue;
      const dialog = entry.root.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog) targets.add(dialog);
    }
  }

  for (const element of Array.from(isolationSnapshots.keys())) {
    if (!targets.has(element)) restoreIsolatedElement(element);
  }

  for (const element of targets) isolateElement(element);
};

export const isTopmostOverlay = (id: string): boolean => overlayStack.at(-1)?.id === id;

const getTopmostDialog = (): HTMLElement | null =>
  overlayStack.at(-1)?.root.querySelector<HTMLElement>('[role="dialog"]') ?? null;

export const registerOverlay = (entry: OverlayStackEntry): (() => void) => {
  const duplicateIndex = overlayStack.findIndex(({ id }) => id === entry.id);
  if (duplicateIndex >= 0) overlayStack.splice(duplicateIndex, 1);

  if (overlayStack.length === 0) {
    unlockedBodyOverflow = {
      value: document.body.style.getPropertyValue('overflow'),
      priority: document.body.style.getPropertyPriority('overflow'),
    };
    document.body.style.setProperty('overflow', 'hidden');
  }

  overlayStack.push(entry);
  synchronizeModalIsolation();

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;

    const stackIndex = overlayStack.findIndex(({ id }) => id === entry.id);
    if (stackIndex >= 0) overlayStack.splice(stackIndex, 1);
    synchronizeModalIsolation();

    if (overlayStack.length === 0 && unlockedBodyOverflow) {
      if (unlockedBodyOverflow.value) {
        document.body.style.setProperty(
          'overflow',
          unlockedBodyOverflow.value,
          unlockedBodyOverflow.priority,
        );
      } else {
        document.body.style.removeProperty('overflow');
      }
      unlockedBodyOverflow = null;
    }
  };
};

export const canRestoreFocus = (element: HTMLElement | null): boolean =>
  Boolean(element?.isConnected && !element.matches(':disabled') && !isHiddenOrInert(element));

export const focusTopmostDialog = (): void => {
  const dialog = getTopmostDialog();
  if (!dialog) return;
  (getFocusableElements(dialog)[0] ?? dialog).focus();
};
