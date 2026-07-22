import { useTheme } from '@emotion/react';
import { GeneratedPromptPreview } from './GeneratedPromptPreview';
import { PromptFeedback } from './PromptFeedback';
import { PromptIntentFields } from './PromptIntentFields';
import type { ReferenceImageGeneratorProps } from './ReferenceImageGenerator';
import type { PromptBuilderDraft, PromptIntent, PromptValidation } from './model';
import type { PromptWorkshopStep, PromptWorkshopStepId } from './workshopSteps';
import {
  accordionStyles,
  chevronStyles,
  reviewColumnStyles,
  reviewToggleStyles,
  stepButtonStyles,
  stepCopyStyles,
  stepDescriptionStyles,
  stepLabelStyles,
  stepNumberStyles,
  stepPanelStyles,
  stepStyles,
  stepSummaryStyles,
} from './CharacterPromptWorkshop.styles';

interface PromptWorkshopAccordionProps {
  readonly componentId: string;
  readonly intent: PromptIntent;
  readonly draft: PromptBuilderDraft;
  readonly validation: PromptValidation;
  readonly steps: readonly PromptWorkshopStep[];
  readonly activeStep: PromptWorkshopStepId;
  readonly onActiveStepChange: (step: PromptWorkshopStepId) => void;
  readonly onDraftChange: (draft: PromptBuilderDraft) => void;
}

export const PromptWorkshopAccordion = ({
  componentId,
  intent,
  draft,
  validation,
  steps,
  activeStep,
  onActiveStepChange,
  onDraftChange,
}: PromptWorkshopAccordionProps) => {
  const theme = useTheme();

  return (
    <div css={accordionStyles(theme)} aria-label="Prompt sections">
      {steps.map((step, index) => {
        const panelId = `${componentId}-${intent}-${step.id}-panel`;
        const buttonId = `${componentId}-${intent}-${step.id}-button`;
        const active = step.id === activeStep;

        return (
          <section key={step.id} css={stepStyles(theme, active)}>
            <button
              id={buttonId}
              type="button"
              aria-expanded={active}
              aria-controls={panelId}
              css={stepButtonStyles(theme, active)}
              onClick={() => onActiveStepChange(step.id)}
            >
              <span aria-hidden="true" css={stepNumberStyles(theme, active)}>
                {index + 1}
              </span>
              <span css={stepCopyStyles()}>
                <span css={stepLabelStyles(theme)}>{step.label}</span>
                <span css={stepSummaryStyles(theme)} title={step.summary}>
                  {step.summary}
                </span>
              </span>
              <span aria-hidden="true" css={chevronStyles(theme, active)}>
                ›
              </span>
            </button>

            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!active}
              css={active ? stepPanelStyles(theme) : undefined}
            >
              {active ? (
                <>
                  <p css={stepDescriptionStyles(theme)}>{step.description}</p>
                  <PromptIntentFields
                    draft={draft}
                    issues={validation.blocking}
                    activeStep={activeStep}
                    onChange={onDraftChange}
                  />
                </>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export type PromptWorkshopReferenceGeneration = Omit<ReferenceImageGeneratorProps, 'prompt'>;

interface PromptWorkshopReviewProps {
  readonly componentId: string;
  readonly intent: PromptIntent;
  readonly generatedPrompt: string;
  readonly validation: PromptValidation;
  readonly showSummary: boolean;
  readonly referenceGeneration?: PromptWorkshopReferenceGeneration;
  readonly onToggleSummary: () => void;
}

export const PromptWorkshopReview = ({
  componentId,
  intent,
  generatedPrompt,
  validation,
  showSummary,
  referenceGeneration,
  onToggleSummary,
}: PromptWorkshopReviewProps) => {
  const theme = useTheme();
  const summaryId = `${componentId}-recipe-summary`;

  return (
    <aside css={reviewColumnStyles(theme)} aria-label="Recipe review">
      <button
        type="button"
        aria-expanded={showSummary}
        aria-controls={summaryId}
        css={reviewToggleStyles(theme)}
        onClick={onToggleSummary}
      >
        <span>Generated recipe summary</span>
        <span aria-hidden="true">{showSummary ? '−' : '+'}</span>
      </button>
      {showSummary ? (
        <div id={summaryId}>
          <GeneratedPromptPreview
            prompt={generatedPrompt}
            label={intent === 'character-transform' ? 'Original character recipe' : undefined}
            {...(referenceGeneration ? { referenceGeneration } : {})}
          />
        </div>
      ) : null}
      <PromptFeedback validation={validation} />
    </aside>
  );
};
