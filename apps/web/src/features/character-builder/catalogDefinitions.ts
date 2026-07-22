import type { GuidedChoiceKey, VisualProfile } from '@studio/domain';

export const VISUAL_PROFILES: readonly VisualProfile[] = [
  'woman',
  'man',
  'non-binary',
  'unspecified',
];

export type ProfileAssetCategory =
  | 'accessories'
  | 'ages'
  | 'appearances'
  | 'backgrounds'
  | 'body-shapes'
  | 'expressions'
  | 'hairstyles'
  | 'moods'
  | 'outfits'
  | 'roles'
  | 'styles';

export type SharedOptionDefinition = readonly [label: string, promptFragment?: string];
export type ProfileOptionDefinition = readonly [
  label: string,
  promptFragment?: string,
  slug?: string,
];

export const GENDER_DEFINITIONS: readonly SharedOptionDefinition[] = [
  ['Woman', 'adult woman'],
  ['Man', 'adult man'],
  ['Non-binary', 'non-binary adult'],
  ['Not specified', 'adult person'],
];

export const AGE_DEFINITIONS: readonly SharedOptionDefinition[] = [
  ['Adult', 'adult'],
  ['Young adult', 'young adult'],
  ['Middle-aged adult', 'middle-aged adult'],
  ['Older adult', 'older adult'],
];

export const APPEARANCE_DEFINITIONS: Readonly<
  Record<VisualProfile, readonly ProfileOptionDefinition[]>
> = {
  woman: [
    ['Natural', 'natural adult appearance with understated grooming'],
    ['Polished', 'polished adult appearance with refined grooming'],
    ['Editorial', 'editorial adult styling with defined features'],
    ['Soft', 'soft approachable adult styling'],
    ['Bold', 'bold high-contrast adult styling'],
    ['Minimal', 'minimal makeup and natural texture'],
  ],
  man: [
    ['Natural', 'natural adult appearance with understated grooming'],
    ['Clean-shaven', 'clean-shaven adult appearance'],
    ['Light stubble', 'adult appearance with light neat stubble'],
    ['Short beard', 'adult appearance with a neatly shaped short beard'],
    ['Polished', 'polished adult appearance with refined grooming'],
    ['Rugged', 'rugged adult styling with natural texture'],
  ],
  'non-binary': [
    ['Natural', 'natural adult appearance with understated grooming'],
    ['Polished', 'polished adult appearance with refined grooming'],
    ['Androgynous', 'androgynous adult styling'],
    ['Soft', 'soft approachable adult styling'],
    ['Bold', 'bold high-contrast adult styling'],
    ['Minimal', 'minimal makeup and natural texture'],
  ],
  unspecified: [
    ['Natural', 'natural adult appearance with understated grooming'],
    ['Polished', 'polished adult appearance with refined grooming'],
    ['Editorial', 'editorial adult styling with defined features'],
    ['Soft', 'soft approachable adult styling'],
    ['Bold', 'bold high-contrast adult styling'],
    ['Minimal', 'minimal styling with natural texture'],
  ],
};

export const BODY_SHAPE_DEFINITIONS: Readonly<
  Record<VisualProfile, readonly ProfileOptionDefinition[]>
> = {
  woman: [
    ['Slender', 'adult woman with a slender body shape'],
    ['Balanced', 'adult woman with a balanced body shape'],
    ['Athletic', 'adult woman with an athletic body shape'],
    ['Hourglass', 'adult woman with an hourglass body shape'],
    ['Curvy', 'adult woman with a curvy body shape'],
    ['Full', 'adult woman with a full body shape'],
  ],
  man: [
    ['Lean', 'adult man with a lean body shape'],
    ['Balanced', 'adult man with a balanced body shape'],
    ['Athletic', 'adult man with an athletic body shape'],
    ['Muscular', 'adult man with a muscular body shape'],
    ['Broad', 'adult man with a broad body shape'],
    ['Full', 'adult man with a full body shape'],
  ],
  'non-binary': [
    ['Lean', 'non-binary adult with a lean body shape'],
    ['Balanced', 'non-binary adult with a balanced body shape'],
    ['Athletic', 'non-binary adult with an athletic body shape'],
    ['Soft-curved', 'non-binary adult with a soft-curved body shape'],
    ['Broad', 'non-binary adult with a broad body shape'],
    ['Full', 'non-binary adult with a full body shape'],
  ],
  unspecified: [
    ['Slender', 'adult with a slender body shape'],
    ['Balanced', 'adult with a balanced body shape'],
    ['Athletic', 'adult with an athletic body shape'],
    ['Curved', 'adult with a curved body shape'],
    ['Broad', 'adult with a broad body shape'],
    ['Full', 'adult with a full body shape'],
  ],
};

export const HAIRSTYLE_DEFINITIONS: Readonly<
  Record<VisualProfile, readonly ProfileOptionDefinition[]>
> = {
  woman: [
    ['Pixie'],
    ['Bob'],
    ['Shoulder-length straight'],
    ['Long waves'],
    ['Natural curls'],
    ['Braids'],
  ],
  man: [
    ['Shaved/buzzed', 'shaved or buzzed hairstyle', 'shaved-buzzed'],
    ['Short crop'],
    ['Fade'],
    ['Side part'],
    ['Textured medium'],
    ['Shoulder-length'],
  ],
  'non-binary': [
    ['Cropped'],
    ['Undercut'],
    ['Textured curls'],
    ['Medium waves'],
    ['Shoulder-length'],
    ['Braids'],
  ],
  unspecified: [['Short'], ['Medium'], ['Long'], ['Waves'], ['Curls'], ['Braids']],
};

export const OUTFIT_DEFINITIONS: Readonly<
  Record<VisualProfile, readonly ProfileOptionDefinition[]>
> = {
  woman: [
    ['Professional', "tailored women's blazer and trousers with a defined silhouette"],
    ['Casual', "polished women's casual separates with a relaxed silhouette"],
    ['Outdoor', "practical layered women's outdoor outfit"],
    ['Creative', "expressive women's creative outfit with an artful silhouette"],
    ['Formal', "refined women's formalwear with an elegant silhouette"],
    ['Minimal', "clean minimal women's outfit with streamlined tailoring"],
  ],
  man: [
    ['Professional', "tailored men's suit separates with a structured silhouette"],
    ['Casual', "polished men's casual separates with a relaxed silhouette"],
    ['Outdoor', "practical layered men's outdoor outfit"],
    ['Creative', "expressive men's creative outfit with an artful silhouette"],
    ['Formal', "refined men's formalwear with a structured silhouette"],
    ['Minimal', "clean minimal men's outfit with streamlined tailoring"],
  ],
  'non-binary': [
    ['Professional', 'androgynous tailored separates with a balanced silhouette'],
    ['Casual', 'polished gender-expansive casual separates with a relaxed silhouette'],
    ['Outdoor', 'practical layered gender-expansive outdoor outfit'],
    ['Creative', 'expressive gender-expansive outfit with an artful silhouette'],
    ['Formal', 'androgynous refined formalwear with a fluid tailored silhouette'],
    ['Minimal', 'clean minimal androgynous outfit with streamlined tailoring'],
  ],
  unspecified: [
    ['Professional', 'presentation-neutral tailored separates'],
    ['Casual', 'presentation-neutral polished casual outfit'],
    ['Outdoor', 'presentation-neutral practical layered outdoor outfit'],
    ['Creative', 'presentation-neutral expressive creative outfit'],
    ['Formal', 'presentation-neutral refined formalwear'],
    ['Minimal', 'presentation-neutral clean minimal outfit'],
  ],
};

export const ACCESSORY_DEFINITIONS: Readonly<
  Record<VisualProfile, readonly ProfileOptionDefinition[]>
> = {
  woman: [['None'], ['Stud earrings'], ['Pendant'], ['Glasses'], ['Scarf'], ['Statement earrings']],
  man: [['None'], ['Watch'], ['Glasses'], ['Tie'], ['Pocket square'], ['Simple chain']],
  'non-binary': [
    ['None'],
    ['Glasses'],
    ['Simple chain'],
    ['Scarf'],
    ['Small hoops'],
    ['Statement piece'],
  ],
  unspecified: [
    ['None'],
    ['Glasses'],
    ['Watch'],
    ['Simple jewelry'],
    ['Scarf'],
    ['Statement piece'],
  ],
};

export const HAIR_COLOR_DEFINITIONS: readonly (readonly [
  label: string,
  promptFragment: string,
  swatch: string,
])[] = [
  ['Black', 'black hair', '#151515'],
  ['Dark brown', 'dark brown hair', '#3b2418'],
  ['Light brown', 'light brown hair', '#8a6040'],
  ['Blonde', 'blonde hair', '#d8bd74'],
  ['Auburn/red', 'auburn or red hair', '#9b422b'],
  ['Gray/silver', 'gray or silver hair', '#a8adb4'],
];

export const SHARED_APPEARANCE_DEFINITIONS: readonly SharedOptionDefinition[] = [
  ['Deep complexion', 'deep complexion'],
  ['Medium-deep complexion', 'medium-deep complexion'],
  ['Medium complexion', 'medium complexion'],
  ['Light-medium complexion', 'light-medium complexion'],
  ['Light complexion', 'light complexion'],
  ['Freckled complexion', 'freckled complexion'],
];

export const SKIN_TONE_DEFINITIONS: readonly (readonly [
  label: string,
  promptFragment: string,
  slug: string,
])[] = [
  ['Deep', 'deep skin tone', 'deep'],
  ['Deep brown', 'deep brown skin tone', 'deep-brown'],
  ['Medium brown', 'medium brown skin tone', 'medium-brown'],
  ['Olive / tan', 'olive or tan skin tone', 'olive-tan'],
  ['Light-medium', 'light-medium skin tone', 'light-medium'],
  ['Light', 'light skin tone', 'light'],
];

export const SHARED_SEMANTIC_DEFINITIONS: readonly (readonly [
  category: GuidedChoiceKey,
  definitions: readonly SharedOptionDefinition[],
])[] = [
  ['role', [['Presenter'], ['Teacher'], ['Host'], ['Narrator'], ['Reporter'], ['Coach']]],
  ['style', [['Natural'], ['Cinematic'], ['Bright'], ['Moody'], ['Editorial'], ['Documentary']]],
  [
    'expression',
    [['Warm smile'], ['Friendly'], ['Confident'], ['Thoughtful'], ['Focused'], ['Calm']],
  ],
  [
    'mood',
    [['Welcoming'], ['Energetic'], ['Grounded'], ['Authoritative'], ['Playful'], ['Reflective']],
  ],
  ['background', [['Studio'], ['Office'], ['Outdoors'], ['Home'], ['Newsroom'], ['Plain']]],
];

export const PROFILE_RENDERED_SHARED_ASSETS: Partial<
  Readonly<Record<GuidedChoiceKey, ProfileAssetCategory>>
> = {
  adultAge: 'ages',
  background: 'backgrounds',
  expression: 'expressions',
  mood: 'moods',
  role: 'roles',
  style: 'styles',
};

export type StarterDefinition = readonly [
  id: string,
  label: string,
  description: string,
  role: string,
  style: string,
  mood: string,
  background: string,
];

export const STARTER_DEFINITIONS: readonly StarterDefinition[] = [
  [
    'midnight-host',
    'Midnight Host',
    'A poised late-night host with cinematic studio energy.',
    'Host',
    'Cinematic',
    'Authoritative',
    'Studio',
  ],
  [
    'botanical-explorer',
    'Botanical Explorer',
    'A grounded field guide for nature and discovery stories.',
    'Presenter',
    'Documentary',
    'Grounded',
    'Outdoors',
  ],
  [
    'retro-astronaut',
    'Retro Astronaut',
    'A playful space storyteller with a polished retro look.',
    'Narrator',
    'Editorial',
    'Playful',
    'Plain',
  ],
  [
    'documentary-presenter',
    'Documentary Presenter',
    'A credible presenter for clear, human documentary stories.',
    'Presenter',
    'Documentary',
    'Grounded',
    'Studio',
  ],
  [
    'friendly-teacher',
    'Friendly Teacher',
    'An approachable educator who makes complex ideas feel simple.',
    'Teacher',
    'Bright',
    'Welcoming',
    'Office',
  ],
  [
    'professional-host',
    'Professional Host',
    'A confident host for polished business and event content.',
    'Host',
    'Natural',
    'Authoritative',
    'Studio',
  ],
  [
    'calm-narrator',
    'Calm Narrator',
    'A steady storyteller for thoughtful, measured delivery.',
    'Narrator',
    'Moody',
    'Reflective',
    'Home',
  ],
  [
    'field-reporter',
    'Field Reporter',
    'An alert, clear reporter ready for stories on location.',
    'Reporter',
    'Documentary',
    'Energetic',
    'Outdoors',
  ],
  [
    'creative-storyteller',
    'Creative Storyteller',
    'An expressive narrator for imaginative, visually rich stories.',
    'Narrator',
    'Cinematic',
    'Playful',
    'Home',
  ],
];
