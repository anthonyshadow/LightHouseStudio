import { useTheme } from '@emotion/react';
import type { HTMLAttributes, ReactNode, RefObject } from 'react';
import { pageHeaderStyles, pageShellStyles } from './PageShell.styles';

/**
 * The content frame of a top-level page: one max width, one padding scale, no card chrome.
 *
 * It is deliberately separate from whichever element owns scrolling. A surface keeps its own
 * scroll container — that is where `overflow` and route-level scroll restoration live — and puts
 * the shell inside it.
 */
export const PageShell = ({
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) => {
  const theme = useTheme();
  return (
    <div css={pageShellStyles(theme)} {...rest}>
      {children}
    </div>
  );
};

/**
 * The masthead of a top-level page: an optional eyebrow, one `h1` on the shared scale, an optional
 * description, and an actions slot that holds one primary plus an optional `ActionMenu`.
 *
 * `headingId` and `headingRef` stay callers' business because `focusesMainOnNavigation` and the
 * surfaces' own announcements move focus to these headings by id.
 */
export const PageHeader = ({
  eyebrow,
  title,
  headingId,
  headingRef,
  description,
  actions,
  breadcrumb,
  children,
  className,
}: Readonly<{
  eyebrow?: ReactNode;
  title: ReactNode;
  headingId?: string;
  /**
   * Narrower than React 19's `Ref`, deliberately: the cleanup-returning callback form has two
   * incompatible declarations in this tree (two `@types/react` copies), and no caller needs it.
   */
  headingRef?: RefObject<HTMLHeadingElement | null> | ((node: HTMLHeadingElement | null) => void);
  description?: ReactNode;
  /** One primary control, optionally followed by an `ActionMenu`. */
  actions?: ReactNode;
  /** Rendered above the identity row, for surfaces that are reached from a parent. */
  breadcrumb?: ReactNode;
  /** Metadata rows and progress strips, rendered under the description inside the identity block. */
  children?: ReactNode;
  /** Set by Emotion's `css` prop, so a surface can add rules for what it puts inside the header. */
  className?: string;
}>) => {
  const theme = useTheme();
  return (
    <header css={pageHeaderStyles(theme)} {...(className === undefined ? {} : { className })}>
      {breadcrumb}
      <div data-page-identity>
        <div>
          {eyebrow === undefined ? null : <span data-page-eyebrow>{eyebrow}</span>}
          <h1
            {...(headingId === undefined ? {} : { id: headingId })}
            ref={headingRef}
            tabIndex={-1}
          >
            {title}
          </h1>
          {description === undefined ? null : <p data-page-description>{description}</p>}
          {children}
        </div>
        {actions === undefined ? null : <div data-page-actions>{actions}</div>}
      </div>
    </header>
  );
};
