import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { focusRingStyles } from '../theme';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  shortLabel?: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  label: string;
  value: T;
  items: readonly TabItem<T>[];
  onChange: (value: T) => void;
}

const rootStyles = (): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
});

const tabListStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  gap: theme.space.xxs,
  padding: theme.space.xxs,
  overflowX: 'auto',
  overscrollBehaviorInline: 'contain',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
});

const tabStyles = (theme: Theme, selected: boolean): CSSObject => ({
  flex: '1 1 0',
  minWidth: 'max-content',
  minHeight: '2.75rem',
  padding: `${theme.space.xs} ${theme.space.sm}`,
  overflow: 'hidden',
  border: '1px solid transparent',
  borderRadius: `calc(${theme.radii.medium} - 0.2rem)`,
  color: selected ? theme.colors.onAccent : theme.colors.textMuted,
  background: selected ? theme.colors.accent : 'transparent',
  fontSize: theme.fontSizes.body,
  fontWeight: 740,
  lineHeight: 1.2,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: `color ${theme.motion.quick}, border-color ${theme.motion.quick}, background ${theme.motion.quick}`,
  '&:hover:not(:disabled)': {
    color: selected ? theme.colors.onAccent : theme.colors.text,
    background: selected ? theme.colors.accentStrong : theme.colors.surfaceStrong,
  },
  '&:focus-visible': focusRingStyles(theme),
  '&:disabled': {
    cursor: 'not-allowed',
    opacity: 0.48,
  },
});

const fullLabelStyles = (): CSSObject => ({
  '@media (max-width: 31rem)': { display: 'none' },
});

const shortLabelStyles = (): CSSObject => ({
  '@media (min-width: 31.001rem)': { display: 'none' },
});

const panelStyles = (): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  '&[hidden]': { display: 'none' },
});

export const Tabs = <T extends string>({ label, value, items, onChange }: TabsProps<T>) => {
  const theme = useTheme();
  const id = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = items.findIndex((item) => item.value === value && !item.disabled);
  const fallbackIndex = items.findIndex((item) => !item.disabled);
  const rovingIndex = selectedIndex >= 0 ? selectedIndex : fallbackIndex;

  const selectAndFocus = (index: number) => {
    const item = items[index];
    if (!item || item.disabled) return;

    onChange(item.value);
    tabRefs.current[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const enabledIndexes = items.flatMap((item, index) => (item.disabled ? [] : [index]));
    if (enabledIndexes.length === 0) return;

    const activeIndex = tabRefs.current.findIndex((tab) => tab === document.activeElement);
    const currentPosition = Math.max(0, enabledIndexes.indexOf(activeIndex));
    let targetPosition = currentPosition;

    switch (event.key) {
      case 'Home':
        targetPosition = 0;
        break;
      case 'End':
        targetPosition = enabledIndexes.length - 1;
        break;
      case 'ArrowRight':
        targetPosition = (currentPosition + 1) % enabledIndexes.length;
        break;
      case 'ArrowLeft':
        targetPosition = (currentPosition - 1 + enabledIndexes.length) % enabledIndexes.length;
        break;
    }

    const targetIndex = enabledIndexes[targetPosition];
    if (targetIndex === undefined) return;

    event.preventDefault();
    selectAndFocus(targetIndex);
  };

  return (
    <div css={rootStyles()}>
      <div
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        tabIndex={-1}
        css={tabListStyles(theme)}
        onKeyDown={handleKeyDown}
      >
        {items.map((item, index) => {
          const selected = item.value === value;
          const tabId = `${id}-tab-${index}`;
          const panelId = `${id}-panel-${index}`;

          return (
            <button
              key={item.value}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              id={tabId}
              type="button"
              role="tab"
              aria-label={item.label}
              aria-selected={selected}
              aria-controls={panelId}
              title={item.label}
              tabIndex={index === rovingIndex ? 0 : -1}
              disabled={item.disabled}
              css={tabStyles(theme, selected)}
              onClick={() => onChange(item.value)}
            >
              {item.shortLabel ? (
                <>
                  <span aria-hidden="true" css={fullLabelStyles()}>
                    {item.label}
                  </span>
                  <span aria-hidden="true" css={shortLabelStyles()}>
                    {item.shortLabel}
                  </span>
                </>
              ) : (
                <span aria-hidden="true">{item.label}</span>
              )}
            </button>
          );
        })}
      </div>

      {items.map((item, index) => (
        <div
          key={item.value}
          id={`${id}-panel-${index}`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`}
          hidden={item.value !== value}
          tabIndex={0}
          css={panelStyles()}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
};
