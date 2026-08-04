import { useTheme } from '@emotion/react';
import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { fieldRootStyles, labelStyles, messageStyles } from './FormControl.styles';
import {
  chevronStyles,
  closeButtonStyles,
  defaultOptionContentStyles,
  emptyStyles,
  menuStyles,
  mobileHeaderStyles,
  mobileHeadingStyles,
  optionListStyles,
  optionStyles,
  popoverLayerStyles,
  selectedMarkStyles,
  triggerStyles,
  triggerValueStyles,
  triggerWrapStyles,
  type SelectPopoverPosition,
} from './SelectField.styles';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string | undefined;
  readonly disabled?: boolean | undefined;
}

export interface SelectOptionState {
  readonly selected: boolean;
  readonly active: boolean;
}

export interface SelectFieldProps {
  readonly id?: string | undefined;
  readonly name?: string | undefined;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly busy?: boolean | undefined;
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string | undefined;
  readonly emptyMessage?: string | undefined;
  readonly onValueChange: (value: string) => void;
  readonly renderOption?:
    ((option: SelectOption, state: SelectOptionState) => ReactNode) | undefined;
}

type PopoverElement = HTMLDivElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

const DEFAULT_POSITION: SelectPopoverPosition = {
  top: 8,
  left: 8,
  width: 240,
  maxHeight: 288,
};

const isPrintableKey = (event: KeyboardEvent<HTMLElement>) =>
  event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey;

const normalizedSearchText = (value: string) => value.trim().toLocaleLowerCase();

export const SelectField = forwardRef<HTMLButtonElement, SelectFieldProps>(function SelectField(
  {
    id: providedId,
    name,
    label,
    hint,
    error,
    required = false,
    disabled = false,
    busy = false,
    value,
    options,
    placeholder = 'Choose an option',
    emptyMessage = 'No options available',
    onValueChange,
    renderOption,
  },
  forwardedRef,
) {
  const theme = useTheme();
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const labelId = `${id}-label`;
  const listboxId = `${id}-listbox`;
  const messageId = error || hint ? `${id}-message` : undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<PopoverElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeaheadRef = useRef('');
  const typeaheadTimerRef = useRef<number | null>(null);
  const focusFrameRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<SelectPopoverPosition>(DEFAULT_POSITION);
  const supportsPopover =
    typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const unavailable = disabled || busy;

  const cancelScheduledFocus = () => {
    if (focusFrameRef.current === null) return;
    window.cancelAnimationFrame(focusFrameRef.current);
    focusFrameRef.current = null;
  };

  const scheduleFocus = (target: () => HTMLElement | null | undefined) => {
    cancelScheduledFocus();
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = null;
      target()?.focus();
    });
  };

  const setTriggerRef = (node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const firstEnabledIndex = (start: number, direction: 1 | -1): number => {
    if (options.length === 0) return -1;
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (start + offset * direction + options.length) % options.length;
      if (!options[index]?.disabled) return index;
    }
    return -1;
  };

  const focusOption = (index: number) => {
    if (index < 0) return;
    setActiveIndex(index);
    scheduleFocus(() => optionRefs.current[index]);
  };

  const openAt = (index: number) => {
    if (unavailable) return;
    setOpen(true);
    focusOption(index);
  };

  const close = (restoreFocus = false) => {
    cancelScheduledFocus();
    setOpen(false);
    if (restoreFocus) scheduleFocus(() => triggerRef.current);
  };

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    cancelScheduledFocus();
    setOpen(false);
    if (option.value !== value) onValueChange(option.value);
    scheduleFocus(() => triggerRef.current);
  };

  const move = (current: number, direction: 1 | -1) => {
    const next = firstEnabledIndex(current + direction, direction);
    if (next >= 0) focusOption(next);
  };

  const typeahead = (key: string, startIndex: number) => {
    if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
    typeaheadRef.current += normalizedSearchText(key);
    typeaheadTimerRef.current = window.setTimeout(() => {
      typeaheadRef.current = '';
      typeaheadTimerRef.current = null;
    }, 600);

    const query = typeaheadRef.current;
    const offsetStart = Math.max(startIndex, -1) + 1;
    for (let offset = 0; offset < options.length; offset += 1) {
      const index = (offsetStart + offset) % options.length;
      const option = options[index];
      if (option && !option.disabled && normalizedSearchText(option.label).startsWith(query)) {
        openAt(index);
        return;
      }
    }
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const selectedOrFirst =
      selectedIndex >= 0 && !options[selectedIndex]?.disabled
        ? selectedIndex
        : firstEnabledIndex(0, 1);
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault();
        openAt(selectedOrFirst);
        break;
      case 'ArrowUp':
        event.preventDefault();
        openAt(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options.length - 1, -1));
        break;
      case 'Home':
        event.preventDefault();
        openAt(firstEnabledIndex(0, 1));
        break;
      case 'End':
        event.preventDefault();
        openAt(firstEnabledIndex(options.length - 1, -1));
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
        break;
      default:
        if (isPrintableKey(event)) typeahead(event.key, selectedIndex);
    }
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(index, 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(index, -1);
        break;
      case 'Home':
        event.preventDefault();
        focusOption(firstEnabledIndex(0, 1));
        break;
      case 'End':
        event.preventDefault();
        focusOption(firstEnabledIndex(options.length - 1, -1));
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (options[index]) choose(options[index]);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (isPrintableKey(event)) typeahead(event.key, index);
    }
  };

  useEffect(
    () => () => {
      if (typeaheadTimerRef.current !== null) window.clearTimeout(typeaheadTimerRef.current);
      cancelScheduledFocus();
    },
    [],
  );

  useEffect(() => {
    if (unavailable && open) setOpen(false);
  }, [open, unavailable]);

  useEffect(() => {
    if (!open) return;
    const closeForOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current);
        focusFrameRef.current = null;
      }
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeForOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeForOutsidePointer, true);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const popover = popoverRef.current;
    try {
      popover?.showPopover?.();
    } catch {
      // The state-rendered fixed fallback remains usable when the Popover API is unavailable.
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const edge = 8;
      const gap = 8;
      const desiredHeight = 288;
      const spaceBelow = viewportHeight - rect.bottom - edge - gap;
      const spaceAbove = rect.top - edge - gap;
      const openBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(120, Math.min(desiredHeight, openBelow ? spaceBelow : spaceAbove));
      const width = Math.min(Math.max(rect.width, 240), viewportWidth - edge * 2);
      const left = Math.min(Math.max(rect.left, edge), viewportWidth - width - edge);
      const top = openBelow ? rect.bottom + gap : Math.max(edge, rect.top - maxHeight - gap);
      setPosition({ top, left, width, maxHeight });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      try {
        popover?.hidePopover?.();
      } catch {
        // Already hidden or unsupported.
      }
    };
  }, [open]);

  return (
    <div ref={rootRef} css={fieldRootStyles(theme)}>
      <span id={labelId} css={labelStyles(theme)}>
        <span>{label}</span>
        {required ? <span aria-hidden="true">Required</span> : null}
      </span>
      <div css={triggerWrapStyles()}>
        <button
          ref={setTriggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-labelledby={labelId}
          aria-controls={open ? listboxId : undefined}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={Boolean(error)}
          aria-describedby={messageId}
          aria-required={required || undefined}
          aria-busy={busy || undefined}
          disabled={unavailable}
          css={triggerStyles(theme, Boolean(error), open, !selectedOption)}
          onKeyDown={handleTriggerKeyDown}
          onClick={() => {
            if (open) close();
            else
              openAt(
                selectedIndex >= 0 && !options[selectedIndex]?.disabled
                  ? selectedIndex
                  : firstEnabledIndex(0, 1),
              );
          }}
        >
          <span css={triggerValueStyles()}>{selectedOption?.label ?? placeholder}</span>
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            focusable="false"
            css={chevronStyles(theme, open)}
          >
            <path
              d="m5.5 7.5 4.5 4.5 4.5-4.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
            />
          </svg>
        </button>
        {name ? <input type="hidden" name={name} value={value} /> : null}
      </div>

      {open ? (
        <div
          ref={popoverRef}
          {...(supportsPopover ? { popover: 'manual' as const } : {})}
          css={popoverLayerStyles(theme, position)}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) close(true);
          }}
        >
          <div css={menuStyles(theme, position)}>
            <header css={mobileHeaderStyles(theme)}>
              <h2 css={mobileHeadingStyles(theme)}>{label}</h2>
              <button
                type="button"
                aria-label={`Close ${label}`}
                css={closeButtonStyles(theme)}
                onClick={() => close(true)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            <div
              id={listboxId}
              role="listbox"
              aria-labelledby={labelId}
              css={optionListStyles(theme)}
            >
              {options.length === 0 ? <p css={emptyStyles(theme)}>{emptyMessage}</p> : null}
              {options.map((option, index) => {
                const selected = option.value === value;
                const active = index === activeIndex;
                return (
                  <button
                    key={option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    aria-disabled={option.disabled || undefined}
                    disabled={option.disabled}
                    tabIndex={active ? 0 : -1}
                    css={optionStyles(theme, selected, active)}
                    onFocus={() => setActiveIndex(index)}
                    onPointerMove={() => setActiveIndex(index)}
                    onKeyDown={(event) => handleOptionKeyDown(event, index)}
                    onClick={() => choose(option)}
                  >
                    {renderOption ? (
                      renderOption(option, { selected, active })
                    ) : (
                      <span css={defaultOptionContentStyles(theme)}>
                        <strong>{option.label}</strong>
                        {option.description ? <small>{option.description}</small> : null}
                      </span>
                    )}
                    <span css={selectedMarkStyles(theme, selected)} aria-hidden="true">
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {error || hint ? (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          css={messageStyles(theme, Boolean(error))}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
});
