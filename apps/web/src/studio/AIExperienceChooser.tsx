import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { DecartStartDisclosure } from '../features/media-session';
import { Button, OverlayPanel, StatusNotice } from '../ui';
import type { CapabilityState } from './StudioHeader';

type AIExperienceChooserProps = {
  open: boolean;
  decartAvailable: boolean;
  capabilityState: CapabilityState;
  activeCharacterName?: string | undefined;
  characterReady: boolean;
  virtualTryOnReady: boolean;
  providerStartBlockedReason?: string;
  onClose: () => void;
  onStartCharacter: () => void;
  onCreateCharacter: () => void;
  onChooseSavedCharacter: () => void;
  onStartVirtualTryOn: () => void;
  onConfigureVirtualTryOn: () => void;
  onChooseSavedVirtualTryOn: () => void;
};

const chooserStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.space.md,
  width: 'min(52rem, 100%)',
  marginInline: 'auto',
  padding: theme.space.xs,
  '@media (max-width: 47.99rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: theme.space.sm,
  },
});

const experienceCardStyles = (theme: Theme, primary: boolean): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.sm,
  padding: theme.space.lg,
  border: `1px solid ${primary ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: primary
    ? `linear-gradient(145deg, ${theme.colors.accentSoft}, ${theme.colors.surfaceSoft})`
    : theme.colors.surfaceSoft,
  '& header': { display: 'grid', gap: theme.space.xs },
  '& h3': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.05rem, 2vw, 1.35rem)',
  },
  '& p': {
    minHeight: '3.1em',
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.5,
  },
  '& > div': {
    display: 'grid',
    gap: theme.space.xs,
    marginBlockStart: 'auto',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    padding: theme.space.md,
    '& p': { minHeight: 0 },
  },
});

const eyebrowStyles = (theme: Theme, primary: boolean): CSSObject => ({
  color: primary ? theme.colors.accentStrong : theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  fontWeight: 850,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});

const unavailableMessage = (state: CapabilityState): string => {
  switch (state) {
    case 'loading':
      return 'Integration configuration is still loading. Character and outfit preparation remain available.';
    case 'error':
      return 'Integration configuration could not be read. Retry from the header; local preparation remains available.';
    case 'ready':
      return 'Decart is not configured. You can prepare characters and outfits, but AI Start is unavailable.';
  }
};

export const AIExperienceChooser = ({
  open,
  decartAvailable,
  capabilityState,
  activeCharacterName,
  characterReady,
  virtualTryOnReady,
  providerStartBlockedReason,
  onClose,
  onStartCharacter,
  onCreateCharacter,
  onChooseSavedCharacter,
  onStartVirtualTryOn,
  onConfigureVirtualTryOn,
  onChooseSavedVirtualTryOn,
}: AIExperienceChooserProps) => {
  const theme = useTheme();
  const startAvailable =
    capabilityState === 'ready' && decartAvailable && !providerStartBlockedReason;
  const startUnavailableMessage = providerStartBlockedReason ?? unavailableMessage(capabilityState);

  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title="Choose live AI experience"
      description="Your camera and microphone stay on while you choose how to transform the live preview."
      placement="fullscreen"
      size="wide"
      bodyMode="scroll"
      closeLabel="Cancel AI experience selection"
    >
      <div css={chooserStyles(theme)}>
        <article css={experienceCardStyles(theme, true)}>
          <header>
            <span css={eyebrowStyles(theme, true)}>Live AI · Character</span>
            <h3>Character Transformation</h3>
            <p>
              {activeCharacterName
                ? `${activeCharacterName} is selected and ready to use.`
                : 'Create a character or choose one from your browser-local collection.'}
            </p>
          </header>
          <div>
            {characterReady && startAvailable ? (
              <>
                <Button variant="primary" onClick={onStartCharacter}>
                  Start with {activeCharacterName}
                </Button>
                <DecartStartDisclosure />
              </>
            ) : (
              <>
                <Button variant="primary" onClick={onCreateCharacter}>
                  Create Character
                </Button>
                <Button variant="secondary" onClick={onChooseSavedCharacter}>
                  Choose Saved Character
                </Button>
              </>
            )}
            {!startAvailable ? (
              <StatusNotice role="status">{startUnavailableMessage}</StatusNotice>
            ) : null}
          </div>
        </article>

        <article css={experienceCardStyles(theme, false)}>
          <header>
            <span css={eyebrowStyles(theme, false)}>Live AI · Try-On</span>
            <h3>Virtual Try-On</h3>
            <p>Preview a saved outfit using the existing Virtual Try-On configuration.</p>
          </header>
          <div>
            {virtualTryOnReady && startAvailable ? (
              <>
                <Button variant="primary" onClick={onStartVirtualTryOn}>
                  Start Virtual Try-On
                </Button>
                <DecartStartDisclosure />
              </>
            ) : (
              <Button variant="primary" onClick={onConfigureVirtualTryOn}>
                Configure Virtual Try-On
              </Button>
            )}
            <Button variant="secondary" onClick={onChooseSavedVirtualTryOn}>
              Choose Saved Try-On
            </Button>
            {!startAvailable ? (
              <StatusNotice role="status">{startUnavailableMessage}</StatusNotice>
            ) : null}
          </div>
        </article>
      </div>
    </OverlayPanel>
  );
};
