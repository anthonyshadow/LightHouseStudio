import { useTheme, type CSSObject, type Theme } from '@emotion/react';

const collapsedSectionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: theme.space.sm,
  '& h3': { margin: 0 },
});

/**
 * A list section with nothing in it and nothing being looked for: its heading and one word.
 *
 * An empty archive is normal, so the surfaces that have one — Projects and Campaigns — should not
 * open with a bordered box and a paragraph explaining that nothing has been archived. Empty
 * containers read as broken. This is the collapsed form both of them use, so the wording and the
 * heading association cannot drift apart.
 *
 * The caller owns the section's own spacing and typography and passes it as `css`; only the
 * arrangement and the sentence live here.
 */
export const CollapsedListSection = ({
  headingId,
  heading,
  note = 'None yet',
  className,
}: {
  readonly headingId: string;
  readonly heading: string;
  /** Overridable for a section whose emptiness needs a different word. */
  readonly note?: string;
  /** Emotion passes the caller's `css` prop through here. */
  readonly className?: string;
}) => {
  const theme = useTheme();
  return (
    <section aria-labelledby={headingId} className={className} css={collapsedSectionStyles(theme)}>
      <h3 id={headingId}>{heading}</h3>
      <span>{note}</span>
    </section>
  );
};
