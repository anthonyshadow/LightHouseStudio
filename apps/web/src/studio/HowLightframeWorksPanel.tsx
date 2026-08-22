import { useTheme } from '@emotion/react';
import type { RefObject } from 'react';
import { OverlayPanel } from '../ui/primitives/OverlayPanel';

const CONCEPTS = [
  {
    id: 'studio',
    name: 'Studio',
    when: 'Where every video starts. Record with your camera or bring in a video you already have, then edit it or transform it with AI.',
    example: 'Record a 30-second product take, trim it, and save it.',
  },
  {
    id: 'videos',
    name: 'Videos',
    when: 'Every video you save lands here, with every saved version kept.',
    example: 'Download yesterday’s cut, or save today’s edit as a new version of the same video.',
  },
  {
    id: 'projects',
    name: 'Projects',
    when: 'Use a Project when you will come back to the same video — it keeps the original video, your AI runs, the current cut and its history together so you can resume.',
    example: 'A product demo you swap the character on today and re-cut next week.',
  },
  {
    id: 'campaigns',
    name: 'Campaigns',
    when: 'Use a Campaign when several Projects belong to one effort and you want them under one name. Entirely optional.',
    example: 'A “Spring launch” Campaign holding one Project per ad placement.',
  },
  {
    id: 'characters',
    name: 'Characters',
    when: 'Save a character once and apply it to any video with Character Swap.',
    example: 'Your brand presenter, reused across every product video.',
  },
  {
    id: 'outfits',
    name: 'Outfits',
    when: 'Keep a Virtual Try-On garment you styled so you can try it on again in new work.',
    example: 'The jacket from last week’s shoot, tried on in today’s video.',
  },
  {
    id: 'voices',
    name: 'Voices',
    when: 'Keep the provider voices you like and send one to Studio for voice work.',
    example: 'A narrator voice you preview once and reuse on every cut.',
  },
] as const;

interface HowLightframeWorksPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

/**
 * The re-learnable version of the dismissed onboarding card: static, reachable from the
 * navigation at any time, and answering when each concept is worth using — not what it is.
 * No route, no persistence, no request.
 */
export const HowLightframeWorksPanel = ({
  open,
  onClose,
  returnFocusRef,
}: HowLightframeWorksPanelProps) => {
  const theme = useTheme();
  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title="How Lightframe works"
      description="Everything starts with a video. Organization is optional — add it when it helps."
      returnFocusRef={returnFocusRef}
      placement="right"
      size="standard"
    >
      <dl
        css={{
          display: 'grid',
          margin: 0,
          gap: theme.space.md,
          '& > div': {
            display: 'grid',
            gap: '0.3rem',
            paddingBlockEnd: theme.space.sm,
            borderBlockEnd: `1px solid ${theme.colors.border}`,
          },
          '& > div:last-of-type': { borderBlockEnd: 0, paddingBlockEnd: 0 },
          '& dt': {
            color: theme.colors.text,
            fontSize: theme.fontSizes.body,
            fontWeight: 800,
          },
          '& dd': {
            margin: 0,
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes.metadata,
            lineHeight: 1.5,
          },
          '& dd[data-concept-example]': { color: theme.colors.textFaint },
        }}
      >
        {CONCEPTS.map((concept) => (
          <div key={concept.id}>
            <dt>{concept.name}</dt>
            <dd>{concept.when}</dd>
            <dd data-concept-example="">For example: {concept.example}</dd>
          </div>
        ))}
      </dl>
    </OverlayPanel>
  );
};
