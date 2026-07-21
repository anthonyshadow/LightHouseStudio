import { useTheme } from '@emotion/react';
import { useState, type ReactNode } from 'react';
import {
  choiceDrawerContentStyles,
  choiceDrawerStyles,
  choiceDrawerSummaryStyles,
  choiceSectionStyles,
} from './GuidedExperience.styles';

export type GuidedChoiceDrawerProps = {
  id: string;
  title: string;
  description: string;
  currentLabel?: string | null | undefined;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Keyboard-native disclosure shared by every character-choice category. */
export const GuidedChoiceDrawer = ({
  id,
  title,
  description,
  currentLabel,
  defaultOpen = false,
  children,
}: GuidedChoiceDrawerProps) => {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section aria-labelledby={`${id}-heading`} css={choiceSectionStyles(theme)}>
      <details
        open={open}
        css={choiceDrawerStyles(theme)}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary css={choiceDrawerSummaryStyles(theme)}>
          <span>
            <span id={`${id}-heading`} role="heading" aria-level={3}>
              {title}
            </span>
            <span data-drawer-description>
              {currentLabel ? `${currentLabel} · ` : ''}
              {description}
            </span>
          </span>
          <span data-drawer-chevron aria-hidden="true">
            ⌄
          </span>
        </summary>
        <div css={choiceDrawerContentStyles(theme)}>{children}</div>
      </details>
    </section>
  );
};
