import { useTheme } from '@emotion/react';
import { TextAreaField, TextField } from '../../ui';
import type { PromptBuilderDraft, PromptIssue } from './model';
import {
  promptFieldGridStyles,
  promptFullWidthStyles,
  promptIssueFor,
  promptValueFrom,
} from './promptFieldLayout';
import type { PromptWorkshopStepId } from './workshopSteps';

type SingleEditDraft = Exclude<PromptBuilderDraft, { intent: 'character-transform' }>;

interface SingleEditIntentFieldsProps {
  draft: SingleEditDraft;
  issues: readonly PromptIssue[];
  activeStep: PromptWorkshopStepId;
  onChange: (draft: PromptBuilderDraft) => void;
}

export const SingleEditIntentFields = ({
  draft,
  issues,
  activeStep,
  onChange,
}: SingleEditIntentFieldsProps) => {
  const theme = useTheme();

  return (
    <div css={promptFieldGridStyles(theme)}>
      {activeStep === 'edit' && draft.intent === 'add-object' ? (
        <>
          <TextField
            label="Object to add"
            required
            placeholder="e.g. a translucent amber umbrella"
            value={draft.objectDescription}
            maxLength={220}
            error={promptIssueFor(issues, 'objectDescription')}
            onChange={(event) => onChange({ ...draft, objectDescription: promptValueFrom(event) })}
          />
          <TextField
            label="Specific placement"
            required
            placeholder="e.g. held in the subject's left hand"
            value={draft.placement}
            maxLength={220}
            error={promptIssueFor(issues, 'placement')}
            onChange={(event) => onChange({ ...draft, placement: promptValueFrom(event) })}
          />
        </>
      ) : null}

      {activeStep === 'edit' && draft.intent === 'replace-object' ? (
        <>
          <TextField
            label="Visible object to replace"
            required
            placeholder="e.g. ceramic mug"
            value={draft.target}
            maxLength={220}
            error={promptIssueFor(issues, 'target')}
            onChange={(event) => onChange({ ...draft, target: promptValueFrom(event) })}
          />
          <TextField
            label="Replacement"
            required
            placeholder="e.g. clear glass tumbler with lime water"
            value={draft.replacementDescription}
            maxLength={220}
            error={promptIssueFor(issues, 'replacementDescription')}
            onChange={(event) =>
              onChange({ ...draft, replacementDescription: promptValueFrom(event) })
            }
          />
        </>
      ) : null}

      {activeStep === 'edit' && draft.intent === 'change-attribute' ? (
        <>
          <TextField
            label="Object to restyle"
            required
            placeholder="e.g. jacket"
            value={draft.target}
            maxLength={220}
            error={promptIssueFor(issues, 'target')}
            onChange={(event) => onChange({ ...draft, target: promptValueFrom(event) })}
          />
          <TextField
            label="Attribute"
            required
            hint="Color, material, finish, texture, or style."
            placeholder="e.g. material"
            value={draft.attribute}
            maxLength={120}
            error={promptIssueFor(issues, 'attribute')}
            onChange={(event) => onChange({ ...draft, attribute: promptValueFrom(event) })}
          />
          <div css={promptFullWidthStyles()}>
            <TextField
              label="New look or value"
              required
              placeholder="e.g. soft brushed copper with a subtle patina"
              value={draft.newValue}
              maxLength={220}
              error={promptIssueFor(issues, 'newValue')}
              onChange={(event) => onChange({ ...draft, newValue: promptValueFrom(event) })}
            />
          </div>
        </>
      ) : null}

      {activeStep === 'constraints' ? (
        <div css={promptFullWidthStyles()}>
          <TextAreaField
            label="Optional guardrails"
            hint="Keep this focused on the same single edit. Up to 500 characters."
            placeholder="Lighting, preservation, or consistency detail…"
            value={draft.customDetails}
            maxLength={500}
            onChange={(event) => onChange({ ...draft, customDetails: promptValueFrom(event) })}
          />
        </div>
      ) : null}
    </div>
  );
};
