import { useTheme } from '@emotion/react';
import { providerDisclosureStyles } from './SessionComposer.styles';

export const DECART_ACTIVE_SESSION_MAX_SECONDS = 300;

export const DecartStartDisclosure = () => {
  const theme = useTheme();

  return (
    <p aria-label="Decart start disclosure" css={providerDisclosureStyles(theme)}>
      Start sends live camera and microphone media, the complete applied recipe, and any reference
      to Decart. Provider usage may begin and lasts at most {DECART_ACTIVE_SESSION_MAX_SECONDS}{' '}
      seconds. Stop AI ends usage; recording finalizes first.
    </p>
  );
};
