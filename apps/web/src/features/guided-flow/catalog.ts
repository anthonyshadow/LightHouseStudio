import type { GuidedChoiceKey, GuidedChoiceValue, GuidedDesignV1, VisualProfile } from './types';
import {
  ACCESSORY_DEFINITIONS,
  AGE_DEFINITIONS,
  APPEARANCE_DEFINITIONS,
  BODY_SHAPE_DEFINITIONS,
  GENDER_DEFINITIONS,
  HAIR_COLOR_DEFINITIONS,
  HAIRSTYLE_DEFINITIONS,
  OUTFIT_DEFINITIONS,
  PROFILE_RENDERED_SHARED_ASSETS,
  SHARED_APPEARANCE_DEFINITIONS,
  SHARED_SEMANTIC_DEFINITIONS,
  SKIN_TONE_DEFINITIONS,
  STARTER_DEFINITIONS,
  VISUAL_PROFILES,
  type ProfileAssetCategory,
} from './catalogDefinitions';

export const VISUAL_CATALOG_VERSION = 1 as const;
export const CUSTOM_OPTION_ID = 'custom' as const;

export type VisualCatalogCategory = GuidedChoiceKey;

export interface VisualCatalogOption {
  readonly id: string;
  readonly category: VisualCatalogCategory;
  readonly profile: VisualProfile | 'shared';
  readonly label: string;
  readonly promptFragment: string;
  readonly imageSrc: string;
  readonly alt: string;
  readonly compatibilityTags: readonly string[];
  readonly swatch?: string;
}

export interface CharacterStarter {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly imageSrcByProfile: Readonly<Record<VisualProfile, string>>;
  readonly choices: GuidedDesignV1['choices'];
}

export interface ResolvedGuidedChoice {
  readonly choice: GuidedChoiceValue | null;
  readonly option: VisualCatalogOption | null;
  readonly customValue: string | null;
  readonly outsideSuggestions: boolean;
}

export interface VisibleVisualOptions {
  readonly suggested: readonly VisualCatalogOption[];
  readonly currentOutsideSuggestions: VisualCatalogOption | null;
  readonly all: readonly VisualCatalogOption[];
}

const escapeXml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const profileLabel = (profile: VisualProfile | 'shared') =>
  profile === 'non-binary'
    ? 'Non-binary'
    : profile === 'unspecified'
      ? 'All presentations'
      : profile === 'shared'
        ? 'Any presentation'
        : `${profile[0]?.toUpperCase() ?? ''}${profile.slice(1)}`;

/** Accessible local illustration used where a photographic catalog asset is unnecessary. */
const illustrationDataUrl = (
  category: VisualCatalogCategory,
  profile: VisualProfile | 'shared',
  label: string,
) => {
  const hues: Record<VisualProfile | 'shared', readonly [string, string]> = {
    woman: ['#55304f', '#e48fc8'],
    man: ['#243f59', '#75b8e8'],
    'non-binary': ['#46346b', '#c49bf7'],
    unspecified: ['#294d48', '#65d9b9'],
    shared: ['#374250', '#e1b866'],
  };
  const [from, to] = hues[profile];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220" role="img" aria-label="${escapeXml(label)}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="320" height="220" rx="24" fill="#101820"/><circle cx="160" cy="88" r="48" fill="url(#g)"/><path d="M72 220c5-57 38-88 88-88s83 31 88 88" fill="url(#g)"/><text x="160" y="192" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="16" font-weight="700">${escapeXml(label)}</text><text x="160" y="212" text-anchor="middle" fill="#c7d1dc" font-family="system-ui,sans-serif" font-size="11">${escapeXml(category)} · ${escapeXml(profileLabel(profile))}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const slugify = (value: string) =>
  value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '');

const visualPath = (category: ProfileAssetCategory, profile: VisualProfile, slug: string) =>
  `/guided-character/${category}/${profile}/${slug}.webp`;

const sharedVisualPath = (category: 'appearances' | 'skin-tones', slug: string) =>
  `/guided-character/${category}/shared/${slug}.webp`;

const option = (
  category: VisualCatalogCategory,
  profile: VisualProfile | 'shared',
  label: string,
  promptFragment: string,
  options: {
    readonly id?: string;
    readonly imageSrc?: string;
    readonly tags?: readonly string[];
    readonly swatch?: string;
  } = {},
): VisualCatalogOption => {
  const id = options.id ?? `${profile}.${category}.${slugify(label)}`;
  return {
    id,
    category,
    profile,
    label,
    promptFragment,
    imageSrc: options.imageSrc ?? illustrationDataUrl(category, profile, label),
    alt: `${label} ${category} direction for ${profileLabel(profile).toLocaleLowerCase()}`,
    compatibilityTags: options.tags ?? [profile, category],
    ...(options.swatch === undefined ? {} : { swatch: options.swatch }),
  };
};

const profiledOptions = (
  category: VisualCatalogCategory,
  profile: VisualProfile,
  definitions: readonly (readonly [label: string, promptFragment?: string, slug?: string])[],
  assetCategory?: ProfileAssetCategory,
) =>
  definitions.map(([label, promptFragment = label.toLocaleLowerCase(), suppliedSlug]) => {
    const slug = suppliedSlug ?? slugify(label);
    return option(category, profile, label, promptFragment, {
      id: `${profile}.${category}.${slug}`,
      ...(assetCategory ? { imageSrc: visualPath(assetCategory, profile, slug) } : {}),
    });
  });

const shared = (
  category: VisualCatalogCategory,
  definitions: readonly (readonly [label: string, promptFragment?: string])[],
  assetCategory?: ProfileAssetCategory,
) =>
  definitions.map(([label, prompt = label.toLocaleLowerCase()]) => {
    const slug = slugify(label);
    const imageSrc = assetCategory
      ? assetCategory === 'appearances'
        ? sharedVisualPath('appearances', slug)
        : visualPath(assetCategory, 'unspecified', slug)
      : null;
    return option(category, 'shared', label, prompt, {
      ...(imageSrc ? { imageSrc } : {}),
    });
  });

const genders = shared('gender', GENDER_DEFINITIONS);

const ages = shared('adultAge', AGE_DEFINITIONS, 'ages');

const appearances = VISUAL_PROFILES.flatMap((profile) =>
  profiledOptions('appearance', profile, APPEARANCE_DEFINITIONS[profile], 'appearances'),
);

const bodyShapes = VISUAL_PROFILES.flatMap((profile) =>
  profiledOptions('bodyShape', profile, BODY_SHAPE_DEFINITIONS[profile], 'body-shapes'),
);

const hairstyles = VISUAL_PROFILES.flatMap((profile) =>
  profiledOptions('hair', profile, HAIRSTYLE_DEFINITIONS[profile], 'hairstyles'),
);

const outfits = VISUAL_PROFILES.flatMap((profile) =>
  profiledOptions('outfit', profile, OUTFIT_DEFINITIONS[profile], 'outfits'),
);

const accessories = VISUAL_PROFILES.flatMap((profile) =>
  profiledOptions('accessories', profile, ACCESSORY_DEFINITIONS[profile], 'accessories'),
);

const hairColors = HAIR_COLOR_DEFINITIONS.map(([label, promptFragment, swatch]) =>
  option('hairColor', 'shared', label, promptFragment, { swatch }),
);

const sharedAppearances = shared('appearance', SHARED_APPEARANCE_DEFINITIONS, 'appearances');

const skinTones = SKIN_TONE_DEFINITIONS.map(([label, promptFragment, slug]) =>
  option('skinTone', 'shared', label, promptFragment, {
    imageSrc: sharedVisualPath('skin-tones', slug),
  }),
);

const sharedOptions = SHARED_SEMANTIC_DEFINITIONS.flatMap(([category, definitions]) =>
  shared(category, definitions, PROFILE_RENDERED_SHARED_ASSETS[category]),
);

export const VISUAL_CATALOG: readonly VisualCatalogOption[] = [
  ...genders,
  ...ages,
  ...appearances,
  ...sharedAppearances,
  ...skinTones,
  ...bodyShapes,
  ...hairstyles,
  ...hairColors,
  ...outfits,
  ...accessories,
  ...sharedOptions,
];

/** Resolve shared semantic artwork against the active presentation without changing its option ID. */
export const getVisualOptionImageSrc = (
  visualOption: VisualCatalogOption,
  profile: VisualProfile,
): string => {
  if (visualOption.profile !== 'shared' || visualOption.swatch) return visualOption.imageSrc;
  const category = PROFILE_RENDERED_SHARED_ASSETS[visualOption.category];
  return category
    ? visualPath(category, profile, slugify(visualOption.label))
    : visualOption.imageSrc;
};

export const getVisualOptionAlt = (
  visualOption: VisualCatalogOption,
  profile: VisualProfile,
): string =>
  visualOption.profile === 'shared' && PROFILE_RENDERED_SHARED_ASSETS[visualOption.category]
    ? `${visualOption.label} ${visualOption.category} direction represented by a ${profileLabel(profile).toLocaleLowerCase()} adult`
    : visualOption.alt;

const starterImageMap = (id: string): Readonly<Record<VisualProfile, string>> => {
  return {
    woman: `/guided-character/starters/woman/${id}.webp`,
    man: `/guided-character/starters/man/${id}.webp`,
    'non-binary': `/guided-character/starters/non-binary/${id}.webp`,
    unspecified: `/guided-character/starters/unspecified/${id}.webp`,
  };
};

const catalogChoice = (
  profile: VisualProfile | 'shared',
  category: VisualCatalogCategory,
  label: string,
) => ({
  optionId: `${profile}.${category}.${slugify(label)}`,
});

const starter = (
  id: string,
  label: string,
  description: string,
  role: string,
  style: string,
  mood: string,
  background: string,
): CharacterStarter => ({
  id,
  label,
  description,
  imageSrcByProfile: starterImageMap(id),
  choices: {
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
    role: catalogChoice('shared', 'role', role),
    style: catalogChoice('shared', 'style', style),
    mood: catalogChoice('shared', 'mood', mood),
    background: catalogChoice('shared', 'background', background),
  },
});

export const CHARACTER_STARTERS: readonly CharacterStarter[] = STARTER_DEFINITIONS.map(
  (definition) => starter(...definition),
);

export const getVisualProfile = (gender: 'woman' | 'man' | 'non-binary' | null): VisualProfile =>
  gender ?? 'unspecified';

export const getSuggestedOptions = (
  category: VisualCatalogCategory,
  profile: VisualProfile,
): readonly VisualCatalogOption[] => {
  const candidates = VISUAL_CATALOG.filter(
    (candidate) =>
      candidate.category === category &&
      (candidate.compatibilityTags.includes('shared') ||
        candidate.compatibilityTags.includes(profile)),
  );
  return candidates.slice(0, category === 'adultAge' || category === 'gender' ? 4 : 6);
};

export const getAllOptionsGroupedByProfile = (
  category: VisualCatalogCategory,
): Readonly<Record<VisualProfile | 'shared', readonly VisualCatalogOption[]>> => ({
  woman: VISUAL_CATALOG.filter(
    (candidate) => candidate.category === category && candidate.profile === 'woman',
  ),
  man: VISUAL_CATALOG.filter(
    (candidate) => candidate.category === category && candidate.profile === 'man',
  ),
  'non-binary': VISUAL_CATALOG.filter(
    (candidate) => candidate.category === category && candidate.profile === 'non-binary',
  ),
  unspecified: VISUAL_CATALOG.filter(
    (candidate) => candidate.category === category && candidate.profile === 'unspecified',
  ),
  shared: VISUAL_CATALOG.filter(
    (candidate) => candidate.category === category && candidate.profile === 'shared',
  ),
});

export const resolveGuidedChoice = (
  category: VisualCatalogCategory,
  profile: VisualProfile,
  choice: GuidedChoiceValue | null | undefined,
): ResolvedGuidedChoice => {
  if (!choice) return { choice: null, option: null, customValue: null, outsideSuggestions: false };
  if (choice.optionId === CUSTOM_OPTION_ID) {
    const customValue = choice.customValue?.trim() || null;
    return { choice, option: null, customValue, outsideSuggestions: false };
  }
  const selected = VISUAL_CATALOG.find(
    (candidate) => candidate.category === category && candidate.id === choice.optionId,
  );
  if (!selected) return { choice, option: null, customValue: null, outsideSuggestions: true };
  return {
    choice,
    option: selected,
    customValue: null,
    outsideSuggestions: !getSuggestedOptions(category, profile).some(
      (candidate) => candidate.id === selected.id,
    ),
  };
};

export const preserveChoiceForProfile = (
  category: VisualCatalogCategory,
  profile: VisualProfile,
  choice: GuidedChoiceValue | null | undefined,
): ResolvedGuidedChoice => resolveGuidedChoice(category, profile, choice);

export const getVisibleOptions = (
  category: VisualCatalogCategory,
  profile: VisualProfile,
  choice: GuidedChoiceValue | null | undefined,
  showAll: boolean,
): VisibleVisualOptions => {
  const suggested = getSuggestedOptions(category, profile);
  const resolved = resolveGuidedChoice(category, profile, choice);
  const all = showAll
    ? VISUAL_CATALOG.filter((candidate) => candidate.category === category)
    : suggested;
  return {
    suggested,
    currentOutsideSuggestions:
      resolved.outsideSuggestions && resolved.option !== null ? resolved.option : null,
    all,
  };
};

export const createCustomGuidedChoice = (customValue: string): GuidedChoiceValue => ({
  optionId: CUSTOM_OPTION_ID,
  customValue,
});
