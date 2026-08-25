import type { ProjectAssetKindContract } from '@studio/contracts';
import type { ReactElement, ReactNode } from 'react';
import { AppIcon } from '../../ui';
import { WorkPosterTile } from './WorkPosterTile';

export const kindLabel = (kind: ProjectAssetKindContract): string =>
  kind === 'video' ? 'Video' : kind.charAt(0).toUpperCase() + kind.slice(1);

// Keyed rather than an if-chain so a new Asset kind fails to compile instead of silently
// rendering the voice icon. Every glyph comes from `AppIcon`, so a Character looks the same here
// as it does in the Studio rail.
export const KIND_ICONS: Record<ProjectAssetKindContract, ReactElement> = {
  video: <AppIcon name="video" />,
  character: <AppIcon name="character" />,
  outfit: <AppIcon name="outfit" />,
  voice: <AppIcon name="microphone" />,
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
