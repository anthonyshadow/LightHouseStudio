import { useTheme } from '@emotion/react';
import { Button, StatusNotice, TextAreaField } from '../../ui';
import type { StudioSessionController } from './types';
import {
  enhancementToggleStyles,
  recipeFieldsHeadingStyles,
  recipeFieldsStyles,
} from './SessionComposer.styles';
import { ReferenceImageField } from './ReferenceImageField';

export interface ModelRecipeFieldsProps {
  session: StudioSessionController;
  recording: boolean;
  onOpenWorkshop: () => void;
}

export const ModelRecipeFields = ({
  session,
  recording,
  onOpenWorkshop,
}: ModelRecipeFieldsProps) => {
  const theme = useTheme();
  if (session.draft.mode === 'local') return null;

  const mode = session.draft.mode;

  return (
    <section aria-labelledby={`${mode}-recipe-fields-heading`} css={recipeFieldsStyles(theme)}>
      <header css={recipeFieldsHeadingStyles(theme)}>
        <h3 id={`${mode}-recipe-fields-heading`}>
          {mode === 'lucy-2.5' ? 'Character recipe' : 'Try-On recipe'}
        </h3>
        <p>
          {session.applied
            ? 'Refine the working draft, then apply the complete recipe when ready.'
            : 'A direction, reference image, or both can start the session.'}
        </p>
      </header>

      <TextAreaField
        label={mode === 'lucy-2.5' ? 'Character direction' : 'Garment direction'}
        value={session.draft.prompt}
        maxLength={1_200}
        disabled={recording}
        placeholder={
          mode === 'lucy-2.5'
            ? 'Describe the character or visible change…'
            : 'Substitute the current top with a navy wool jacket…'
        }
        hint="A prompt, reference image, or both is required. Draft edits never apply silently."
        onChange={(event) => session.updatePrompt(event.target.value)}
      />

      {mode === 'lucy-2.5' ? (
        <Button variant="quiet" disabled={recording} onClick={onOpenWorkshop}>
          Open structured prompt workshop
        </Button>
      ) : null}

      <ReferenceImageField
        mode={mode}
        image={session.draft.image}
        previewUrl={session.draft.imagePreviewUrl}
        disabled={recording}
        onChange={session.updateImage}
      />

      <label css={enhancementToggleStyles(theme)}>
        <input
          type="checkbox"
          checked={session.draft.enhance}
          disabled={recording}
          onChange={(event) => session.updateEnhancement(event.target.checked)}
        />
        <span>
          <strong>Prompt enhancement</strong>
          Optional and off by default. Enabling it lets Decart expand the applied direction.
        </span>
      </label>

      {session.pendingChanges ? (
        <StatusNotice tone="warning" title="Changes are pending" role="status">
          {session.applied?.image && !session.draft.image
            ? 'Reference removal is pending. Apply sends the complete recipe and explicitly clears the live image.'
            : 'The working draft differs from the live recipe. Nothing changes until Apply.'}
        </StatusNotice>
      ) : null}
    </section>
  );
};
