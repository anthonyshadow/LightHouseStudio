import type { ReactNode } from 'react';
import { VisuallyHidden } from './VisuallyHidden';

/**
 * A section's loading state: one polite announcement, and placeholders nobody has to hear about.
 *
 * Six surfaces were writing this pairing by hand, and it carries the accessibility contract —
 * the sentence is said exactly once per section, and the shapes standing in for the content are
 * hidden, so a screen reader hears "loading saved videos" rather than a shape per row. Owning it
 * once means a surface cannot accidentally announce twice, or not at all.
 *
 * The caller supplies the shapes, because only the caller knows the layout being reserved.
 */
export const LoadingPlaceholder = ({
  label,
  count,
  children,
  className,
}: {
  /** What is loading, as a sentence. Announced, never drawn. */
  readonly label: string;
  /** How many rows or cards to reserve. */
  readonly count: number;
  /** One placeholder, rendered `count` times. Receives its index for a keyless caller. */
  readonly children: (index: number) => ReactNode;
  /** Emotion passes the caller's `css` prop through here, onto the list that holds the shapes. */
  readonly className?: string;
}) => (
  <>
    <VisuallyHidden role="status">{label}</VisuallyHidden>
    <ul aria-hidden="true" className={className}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>{children(index)}</li>
      ))}
    </ul>
  </>
);
