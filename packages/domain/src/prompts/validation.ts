import { BUILDER_DETAIL_MAX_LENGTH, canonicalPrompt, normalizeWhitespace } from '../common/text';
import { RECOMMENDED_SHORTEST_SIDE } from '../session/image';
import type {
  CharacterTransformDraft,
  PromptBlockingCode,
  PromptBuilderDraft,
  PromptIssue,
  PromptValidation,
  PromptValidationContext,
  PromptWarningCode,
} from './types';

const genericDescriptions = new Set([
  'a character',
  'character',
  'different',
  'object',
  'person',
  'something',
]);

const minorPattern =
  /\b(?:child|girl|boy|kid|minor|teen|teenager|toddler|infant|age(?:d)?\s*:?\s*(?:[0-9]|1[0-7])\b|(?:[0-9]|1[0-7])\s*(?:-?\s*years?\s*-?\s*old|y\s*\/?\s*o)\b)/iu;
const backgroundPattern = /\b(?:background|environment|room|scene|setting|sky|landscape)\b/iu;
const referencePattern =
  /\b(?:match|use|like)\b.{0,24}\b(?:image|photo|portrait|reference|face)\b/iu;
const goalPattern = /\b(?:add|change|remove|replace|transform|turn)\b/giu;

const contradictoryPairs: readonly (readonly [string, string])[] = [
  ['bald', 'long hair'],
  ['black hair', 'blonde hair'],
  ['frowning', 'smiling'],
  ['matte', 'glossy'],
  ['older adult', 'young adult'],
];

const issue = <TCode extends string>(
  code: TCode,
  message: string,
  field?: string,
): PromptIssue<TCode> => ({ code, message, ...(field ? { field } : {}) });

const allText = (draft: PromptBuilderDraft): string =>
  Object.values(draft)
    .filter((value): value is string => typeof value === 'string')
    .join(' ');

const hasCharacterDetail = (draft: CharacterTransformDraft): boolean =>
  Boolean(
    draft.adultAge ||
    draft.gender ||
    draft.characterBase.trim() ||
    draft.matchReference ||
    draft.appearance.trim() ||
    draft.hair.trim() ||
    draft.outfit.trim() ||
    draft.accessories.trim() ||
    draft.expression.trim() ||
    draft.mood.trim() ||
    draft.preserve.trim() ||
    draft.customDetails.trim(),
  );

const primaryDescriptions = (draft: PromptBuilderDraft): readonly string[] => {
  switch (draft.intent) {
    case 'character-transform':
      return [draft.characterBase];
    case 'add-object':
      return [draft.objectDescription];
    case 'replace-object':
      return [draft.target, draft.replacementDescription];
    case 'change-attribute':
      return [draft.target, draft.newValue];
  }
};

export const validatePromptBuilderDraft = (
  draft: PromptBuilderDraft,
  context: PromptValidationContext = { hasReferenceImage: false },
): PromptValidation => {
  const blockingIssues: PromptIssue<PromptBlockingCode>[] = [];
  const warnings: PromptIssue<PromptWarningCode>[] = [];

  switch (draft.intent) {
    case 'character-transform':
      if (!hasCharacterDetail(draft)) {
        blockingIssues.push(
          issue(
            'character-detail-required',
            'Choose at least one character detail before generating a prompt.',
          ),
        );
      }
      break;
    case 'add-object':
      if (!draft.objectDescription.trim()) {
        blockingIssues.push(
          issue('object-description-required', 'Describe the object to add.', 'objectDescription'),
        );
      }
      if (!draft.placement.trim()) {
        blockingIssues.push(
          issue('placement-required', 'Choose a specific placement.', 'placement'),
        );
      }
      break;
    case 'replace-object':
      if (!draft.target.trim()) {
        blockingIssues.push(
          issue('target-required', 'Name the visible object to replace.', 'target'),
        );
      }
      if (!draft.replacementDescription.trim()) {
        blockingIssues.push(
          issue(
            'replacement-description-required',
            'Describe the replacement object.',
            'replacementDescription',
          ),
        );
      }
      break;
    case 'change-attribute':
      if (!draft.target.trim()) {
        blockingIssues.push(issue('target-required', 'Name the object to change.', 'target'));
      }
      if (!draft.attribute.trim() || !draft.newValue.trim()) {
        blockingIssues.push(
          issue(
            'new-value-required',
            'Choose an attribute and describe its new value.',
            !draft.attribute.trim() ? 'attribute' : 'newValue',
          ),
        );
      }
      break;
  }

  if (draft.customDetails.length > BUILDER_DETAIL_MAX_LENGTH) {
    blockingIssues.push(
      issue(
        'custom-details-too-long',
        `Keep custom details within ${BUILDER_DETAIL_MAX_LENGTH} characters.`,
        'customDetails',
      ),
    );
  }

  const combinedText = normalizeWhitespace(allText(draft));
  const lowerText = combinedText.toLocaleLowerCase('en-US');
  if (minorPattern.test(combinedText)) {
    blockingIssues.push(
      issue(
        'minor-description-not-allowed',
        'Structured character prompts support adult subjects only.',
      ),
    );
  }

  if (primaryDescriptions(draft).some((value) => genericDescriptions.has(canonicalPrompt(value)))) {
    warnings.push(
      issue(
        'generic-description',
        'A more specific description will usually produce a more controllable result.',
      ),
    );
  }

  const goals = combinedText.match(goalPattern)?.length ?? 0;
  if (goals > 1) {
    warnings.push(
      issue(
        'multiple-goals',
        'One clear visual goal at a time usually gives more consistent results.',
      ),
    );
  }

  if (
    contradictoryPairs.some(
      ([left, right]) => lowerText.includes(left) && lowerText.includes(right),
    )
  ) {
    warnings.push(
      issue('contradictory-traits', 'Some selected details appear to contradict each other.'),
    );
  }

  const needsReference =
    (draft.intent === 'character-transform' && draft.matchReference) ||
    referencePattern.test(combinedText);
  if (needsReference && !context.hasReferenceImage) {
    warnings.push(
      issue(
        'reference-image-missing',
        'This prompt refers to an image, but no portrait is selected for the current session.',
      ),
    );
  }

  if (backgroundPattern.test(combinedText)) {
    warnings.push(
      issue(
        'background-edit',
        'Large background or scene changes can reduce realtime subject consistency.',
      ),
    );
  }

  const { width, height } = context.image ?? {};
  if (context.hasReferenceImage && width && height) {
    if (Math.min(width, height) < RECOMMENDED_SHORTEST_SIDE) {
      warnings.push(
        issue(
          'low-reference-resolution',
          'A portrait with a shortest side of at least 512 px usually gives stronger identity guidance.',
        ),
      );
    }
    const ratio = width / height;
    if (ratio < 0.55 || ratio > 1.05) {
      warnings.push(
        issue(
          'weak-reference-aspect',
          'A clear portrait-oriented image usually gives stronger identity guidance.',
        ),
      );
    }
  }

  return { valid: blockingIssues.length === 0, blockingIssues, warnings };
};
