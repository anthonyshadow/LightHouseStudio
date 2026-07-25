import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button, OverlayPanel } from '../ui';

type AIExperienceChooserProps = {
  open: boolean;
  activeCharacterName?: string | undefined;
  characterReady: boolean;
  virtualTryOnReady: boolean;
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

const experienceCardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.sm,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
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

export const AIExperienceChooser = ({
  open,
  activeCharacterName,
  characterReady,
  virtualTryOnReady,
  onClose,
  onStartCharacter,
  onCreateCharacter,
  onChooseSavedCharacter,
  onStartVirtualTryOn,
  onConfigureVirtualTryOn,
  onChooseSavedVirtualTryOn,
}: AIExperienceChooserProps) => {
  const theme = useTheme();

  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title="Choose AI experience"
      description="Your camera and microphone stay on while you choose how to transform the live preview."
      placement="fullscreen"
      size="wide"
      bodyMode="scroll"
      closeLabel="Cancel AI experience selection"
    >
      <div css={chooserStyles(theme)}>
        <article css={experienceCardStyles(theme)}>
          <header>
            <span aria-hidden="true">✦ Character</span>
            <h3>Character Transformation</h3>
            <p>
              {activeCharacterName
                ? `${activeCharacterName} is selected and ready to use.`
                : 'Create a character or choose one from your browser-local collection.'}
            </p>
          </header>
          <div>
            {characterReady ? (
              <Button variant="primary" onClick={onStartCharacter}>
                Start with {activeCharacterName}
              </Button>
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
          </div>
        </article>

        <article css={experienceCardStyles(theme)}>
          <header>
            <span aria-hidden="true">◇ Try-On</span>
            <h3>Virtual Try-On</h3>
            <p>
              Preview a garment recipe using the existing VTON configuration and saved-recipe flow.
            </p>
          </header>
          <div>
            {virtualTryOnReady ? (
              <Button variant="primary" onClick={onStartVirtualTryOn}>
                Start Virtual Try-On
              </Button>
            ) : (
              <Button variant="primary" onClick={onConfigureVirtualTryOn}>
                Configure Virtual Try-On
              </Button>
            )}
            <Button variant="secondary" onClick={onChooseSavedVirtualTryOn}>
              Choose Saved Try-On
            </Button>
          </div>
        </article>
      </div>
    </OverlayPanel>
  );
};
