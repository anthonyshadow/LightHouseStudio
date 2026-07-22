import {
  createPromptBuilderDraft,
  type AdultAgeChoice,
  type CharacterTransformDraft,
} from '@studio/domain';
import {
  CHARACTER_STARTERS,
  CUSTOM_OPTION_ID,
  VISUAL_CATALOG,
  VISUAL_CATALOG_VERSION,
  getSuggestedOptions,
  getVisualProfile,
  resolveGuidedChoice,
  type CharacterStarter,
  type VisualCatalogCategory,
} from './catalog';
import type {
  GuidedChoiceKey,
  GuidedChoiceValue,
  GuidedDesignV1,
  VisualProfile,
} from '@studio/domain';

export type GenderValue = CharacterTransformDraft['gender'];

export const GENDER_OPTIONS: readonly {
  value: GenderValue;
  profile: VisualProfile;
  label: string;
  description: string;
}[] = [
  {
    value: 'woman',
    profile: 'woman',
    label: 'Woman',
    description: 'Show woman-presenting visual suggestions.',
  },
  {
    value: 'man',
    profile: 'man',
    label: 'Man',
    description: 'Show man-presenting visual suggestions.',
  },
  {
    value: 'non-binary',
    profile: 'non-binary',
    label: 'Non-binary',
    description: 'Show non-binary visual suggestions.',
  },
  {
    value: null,
    profile: 'unspecified',
    label: 'Not specified',
    description: 'Use presentation-neutral suggestions.',
  },
];

export const EDITABLE_CHARACTER_CATEGORIES: readonly {
  category: Exclude<VisualCatalogCategory, 'gender'>;
  title: string;
  description: string;
  customLabel: string;
  fixed?: boolean;
}[] = [
  {
    category: 'adultAge',
    title: 'Adult age',
    description: 'All choices describe adults. Artwork follows the selected presentation.',
    customLabel: '',
    fixed: true,
  },
  {
    category: 'appearance',
    title: 'Appearance',
    description: 'Choose a grooming direction, or use Show All for shared complexion choices.',
    customLabel: 'Describe the appearance you want',
  },
  {
    category: 'skinTone',
    title: 'Skin tone',
    description: 'Shared visual suggestions remain available for every gender presentation.',
    customLabel: 'Describe the skin tone you want',
  },
  {
    category: 'bodyShape',
    title: 'Body shape',
    description: 'A visual direction for silhouette and proportions—not a restriction.',
    customLabel: 'Describe the body shape you want',
  },
  {
    category: 'hair',
    title: 'Hairstyle',
    description: 'Six suggestions adapt to presentation. Hair color stays independent.',
    customLabel: 'Describe the hairstyle you want',
  },
  {
    category: 'hairColor',
    title: 'Hair color',
    description: 'Pick a color independently from the hairstyle.',
    customLabel: 'Describe another hair color',
  },
  {
    category: 'outfit',
    title: 'Outfit',
    description: 'The six concepts stay familiar while their cuts and silhouettes adapt.',
    customLabel: 'Describe the outfit you want',
  },
  {
    category: 'accessories',
    title: 'Accessories',
    description: 'Suggested accessories adapt, and every catalog option remains available.',
    customLabel: 'Describe the accessories you want',
  },
  {
    category: 'role',
    title: 'Role',
    description: 'Choose how this character shows up for the audience.',
    customLabel: 'Describe another role',
  },
  {
    category: 'style',
    title: 'Style',
    description: 'Set the overall visual treatment.',
    customLabel: 'Describe another visual style',
  },
  {
    category: 'expression',
    title: 'Expression',
    description: 'The meaning is shared; the representative person follows presentation.',
    customLabel: 'Describe another expression',
  },
  {
    category: 'mood',
    title: 'Mood / vibe',
    description: 'Choose the emotional energy of the character.',
    customLabel: 'Describe another mood or vibe',
  },
  {
    category: 'background',
    title: 'Background',
    description: 'Choose the setting around the character.',
    customLabel: 'Describe another background',
  },
];

const emptyChoices = (): GuidedDesignV1['choices'] => ({
  gender: null,
  adultAge: null,
  appearance: null,
  skinTone: null,
  bodyShape: null,
  hair: null,
  hairColor: null,
  outfit: null,
  accessories: null,
  expression: null,
  mood: null,
  role: null,
  style: null,
  background: null,
});

export const createEmptyGuidedDesign = (): GuidedDesignV1 => ({
  catalogVersion: VISUAL_CATALOG_VERSION,
  starterId: null,
  choices: emptyChoices(),
});

export const categoryChoiceKey = (
  category: Exclude<VisualCatalogCategory, 'gender'>,
): GuidedChoiceKey => category;

const comparableChoiceText = (value: string): string =>
  value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en-US');

const choiceFromCanonicalText = (
  category: Exclude<VisualCatalogCategory, 'gender' | 'adultAge'>,
  profile: VisualProfile,
  value: string,
): GuidedChoiceValue | null => {
  if (!value.trim()) return null;
  const comparable = comparableChoiceText(value);
  const candidates = VISUAL_CATALOG.filter((option) => option.category === category).sort(
    (left, right) => {
      const leftPreferred = left.profile === profile || left.profile === 'shared' ? 0 : 1;
      const rightPreferred = right.profile === profile || right.profile === 'shared' ? 0 : 1;
      return leftPreferred - rightPreferred;
    },
  );
  const match = candidates.find(
    (option) =>
      comparableChoiceText(option.promptFragment) === comparable ||
      comparableChoiceText(option.label) === comparable,
  );
  return match ? { optionId: match.id } : { optionId: CUSTOM_OPTION_ID, customValue: value };
};

const ageChoiceFromDraft = (adultAge: AdultAgeChoice | null): GuidedChoiceValue | null =>
  adultAge ? { optionId: `shared.adultAge.${adultAge}` } : null;

const parseLegacyMood = (
  value: string,
): Readonly<{ mood: string; style: string; background: string }> => {
  const result = { mood: '', style: '', background: '' };
  for (const part of value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)) {
    if (part.endsWith(' visual style')) result.style = part.slice(0, -' visual style'.length);
    else if (part.endsWith(' background')) result.background = part.slice(0, -' background'.length);
    else result.mood = result.mood ? `${result.mood}; ${part}` : part;
  }
  return result;
};

/** Hydrate legacy or manually edited canonical values without discarding unknown text. */
export const createGuidedDesignFromDraft = (draft: CharacterTransformDraft): GuidedDesignV1 => {
  const profile = getVisualProfile(draft.gender);
  const starter = CHARACTER_STARTERS.find((candidate) => candidate.id === draft.presetId) ?? null;
  const base =
    starter?.label && draft.characterBase.startsWith(starter.label)
      ? draft.characterBase.slice(starter.label.length).replace(/^\s*,\s*/u, '')
      : draft.characterBase;
  const mood = parseLegacyMood(draft.mood);
  return {
    catalogVersion: VISUAL_CATALOG_VERSION,
    starterId: starter?.id ?? null,
    choices: {
      ...emptyChoices(),
      gender: {
        optionId:
          profile === 'unspecified' ? 'shared.gender.not-specified' : `shared.gender.${profile}`,
      },
      adultAge: ageChoiceFromDraft(draft.adultAge),
      appearance: choiceFromCanonicalText('appearance', profile, draft.appearance),
      skinTone: choiceFromCanonicalText('skinTone', profile, draft.skinTone),
      bodyShape: choiceFromCanonicalText('bodyShape', profile, draft.bodyShape),
      hair: choiceFromCanonicalText('hair', profile, draft.hair),
      hairColor: choiceFromCanonicalText('hairColor', profile, draft.hairColor),
      outfit: choiceFromCanonicalText('outfit', profile, draft.outfit),
      accessories: choiceFromCanonicalText('accessories', profile, draft.accessories),
      expression: choiceFromCanonicalText('expression', profile, draft.expression),
      role: choiceFromCanonicalText('role', profile, base),
      style: choiceFromCanonicalText('style', profile, mood.style),
      mood: choiceFromCanonicalText('mood', profile, mood.mood),
      background: choiceFromCanonicalText('background', profile, mood.background),
    },
  };
};

const findChoice = (
  category: Exclude<VisualCatalogCategory, 'gender'>,
  profile: VisualProfile,
  preferredLabels: readonly string[],
): GuidedChoiceValue | null => {
  const options = getSuggestedOptions(category, profile);
  const selected = preferredLabels
    .map((label) => options.find((candidate) => candidate.label === label))
    .find((candidate) => candidate !== undefined);
  return selected ? { optionId: selected.id } : options[0] ? { optionId: options[0].id } : null;
};

export const starterDefaults = (starter: CharacterStarter, gender: GenderValue): GuidedDesignV1 => {
  const profile = getVisualProfile(gender);
  return {
    catalogVersion: VISUAL_CATALOG_VERSION,
    starterId: starter.id,
    choices: {
      ...emptyChoices(),
      ...starter.choices,
      gender: {
        optionId:
          profile === 'unspecified' ? 'shared.gender.not-specified' : `shared.gender.${profile}`,
      },
      adultAge: findChoice('adultAge', profile, ['Adult']),
      appearance: findChoice('appearance', profile, ['Natural']),
      skinTone: findChoice('skinTone', profile, ['Medium brown']),
      bodyShape: findChoice('bodyShape', profile, ['Balanced']),
      hair: findChoice('hair', profile, ['Medium', 'Textured medium', 'Medium waves', 'Bob']),
      hairColor: findChoice('hairColor', profile, ['Dark brown']),
      outfit: findChoice('outfit', profile, ['Professional']),
      accessories: findChoice('accessories', profile, ['None']),
      expression: findChoice('expression', profile, ['Friendly', 'Warm smile']),
    },
  };
};

export const genderFromDesign = (design: GuidedDesignV1): GenderValue => {
  const id = design.choices.gender?.optionId;
  if (id === 'shared.gender.woman' || id === 'gender.woman') return 'woman';
  if (id === 'shared.gender.man' || id === 'gender.man') return 'man';
  if (id === 'shared.gender.non-binary' || id === 'gender.non-binary') return 'non-binary';
  return null;
};

const choiceText = (
  design: GuidedDesignV1,
  category: Exclude<VisualCatalogCategory, 'gender'>,
  profile: VisualProfile,
): string => {
  const choice = design.choices[categoryChoiceKey(category)];
  const resolved = resolveGuidedChoice(category, profile, choice);
  return resolved.customValue ?? resolved.option?.promptFragment ?? '';
};

const ageFromChoice = (design: GuidedDesignV1, profile: VisualProfile): AdultAgeChoice | null => {
  const choice = resolveGuidedChoice('adultAge', profile, design.choices.adultAge);
  const id = choice.option?.id ?? '';
  const label = choice.option?.label.toLocaleLowerCase() ?? '';
  if (id.endsWith('.young-adult') || label === '20s' || label === '30s') return 'young-adult';
  if (id.endsWith('.middle-aged-adult') || label === '40s') return 'middle-aged-adult';
  if (id.endsWith('.older-adult') || label.startsWith('50')) return 'older-adult';
  if (id.endsWith('.adult') || label === 'adult') return 'adult';
  return null;
};

export const buildCanonicalCharacterDraft = (
  design: GuidedDesignV1,
  prior: CharacterTransformDraft = createPromptBuilderDraft('character-transform'),
): CharacterTransformDraft => {
  const gender = genderFromDesign(design);
  const profile = getVisualProfile(gender);
  const starter = CHARACTER_STARTERS.find((candidate) => candidate.id === design.starterId);
  const role = choiceText(design, 'role', profile);
  const style = choiceText(design, 'style', profile);
  const background = choiceText(design, 'background', profile);
  const vibe = choiceText(design, 'mood', profile);
  return {
    ...prior,
    presetId: design.starterId,
    adultAge: ageFromChoice(design, profile),
    gender,
    characterBase: [starter?.label, role].filter(Boolean).join(', '),
    appearance: choiceText(design, 'appearance', profile),
    skinTone: choiceText(design, 'skinTone', profile),
    bodyShape: choiceText(design, 'bodyShape', profile),
    hair: choiceText(design, 'hair', profile),
    hairColor: choiceText(design, 'hairColor', profile),
    outfit: choiceText(design, 'outfit', profile),
    accessories: choiceText(design, 'accessories', profile),
    expression: choiceText(design, 'expression', profile),
    mood: [vibe, style ? `${style} visual style` : '', background ? `${background} background` : '']
      .filter(Boolean)
      .join('; '),
  };
};
