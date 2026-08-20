import type { ProjectAssetKindContract } from '@studio/contracts';
import type { ReactElement, ReactNode } from 'react';
import { WorkPosterTile } from './WorkPosterTile';

export const kindLabel = (kind: ProjectAssetKindContract): string =>
  kind === 'video' ? 'Video' : kind.charAt(0).toUpperCase() + kind.slice(1);

// Keyed rather than an if-chain so a new Asset kind fails to compile instead of silently
// rendering the voice icon.
export const KIND_ICONS: Record<ProjectAssetKindContract, ReactElement> = {
  video: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none" />
    </svg>
  ),
  character: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 20c.6-4 2.8-6 6.5-6s5.9 2 6.5 6" />
    </svg>
  ),
  outfit: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="m8.5 3-5 2.5L5 10l3-1.2V21h8V8.8l3 1.2 1.5-4.5-5-2.5a4 4 0 0 1-7 0Z" />
    </svg>
  ),
  voice: (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" />
    </svg>
  ),
};

/**
 * One poster tile for an Asset in a Project's library strip.
 *
 * The tile itself — server thumbnail, icon fallback, broken-image recovery — belongs to
 * {@link WorkPosterTile}; this only decides what an Asset kind looks like and is called. The strip
 * names an Asset the same way whether the poster is missing or merely broken, because either way
 * the operator is looking at the Asset they attached, not at a preview that failed.
 */
export const ProjectAssetThumbnail = ({
  kind,
  label,
  thumbnailUrl,
  unavailable,
  decorative = false,
  children,
}: {
  readonly kind: ProjectAssetKindContract;
  readonly label: string;
  readonly thumbnailUrl: string | null;
  readonly unavailable: boolean;
  readonly decorative?: boolean;
  readonly children?: ReactNode;
}) => {
  const caption = unavailable ? 'Asset unavailable' : `${kindLabel(kind)} preview`;
  return (
    <WorkPosterTile
      icon={KIND_ICONS[kind]}
      thumbnailUrl={thumbnailUrl}
      emptyCaption={caption}
      failedCaption={caption}
      label={label}
      kindNoun={kindLabel(kind)}
      unavailable={unavailable}
      decorative={decorative}
      playBadge={kind === 'video'}
    >
      {children}
    </WorkPosterTile>
  );
};
