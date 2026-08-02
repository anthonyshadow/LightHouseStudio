import { useTheme } from '@emotion/react';
import type { RefObject } from 'react';
import { Button, OverlayPanel } from '../ui';

type AIPreparationChooserProps = {
  readonly open: boolean;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
  readonly disabledReason?: string | undefined;
  readonly onClose: () => void;
  readonly onChooseCharacter: () => void;
  readonly onChooseOutfit: () => void;
};

export const AIPreparationChooser = ({
  open,
  returnFocusRef,
  disabledReason,
  onClose,
  onChooseCharacter,
  onChooseOutfit,
}: AIPreparationChooserProps) => {
  const theme = useTheme();
  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title="Select AI"
      description="Prepare a Character or Virtual Try-On recipe. Camera and provider work stay off."
      placement="right"
      bodyMode="contained"
      returnFocusRef={returnFocusRef}
    >
      {open ? (
        <div css={{ display: 'grid', gap: theme.space.sm, alignContent: 'start' }}>
          <section css={{ display: 'grid', gap: theme.space.xs, padding: theme.space.sm }}>
            <h3>Character</h3>
            <p>Create a character or select one already saved in this browser.</p>
            <Button
              variant="primary"
              disabled={Boolean(disabledReason)}
              title={disabledReason}
              onClick={onChooseCharacter}
            >
              Select Character
            </Button>
          </section>
          <section css={{ display: 'grid', gap: theme.space.xs, padding: theme.space.sm }}>
            <h3>Virtual Try-On</h3>
            <p>Create a reusable outfit or select a saved or recently used outfit.</p>
            <Button
              variant="primary"
              disabled={Boolean(disabledReason)}
              title={disabledReason}
              onClick={onChooseOutfit}
            >
              Select Outfit
            </Button>
          </section>
        </div>
      ) : null}
    </OverlayPanel>
  );
};
