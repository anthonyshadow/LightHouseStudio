import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_STARTERS,
  createCustomGuidedChoice,
  getAllOptionsGroupedByProfile,
  getSuggestedOptions,
  getVisualOptionAlt,
  getVisualOptionImageSrc,
  getVisibleOptions,
  preserveChoiceForProfile,
  resolveGuidedChoice,
  VISUAL_CATALOG,
} from './catalog';
import type { GuidedChoiceKey, VisualProfile } from '@studio/domain';

const profiles: readonly VisualProfile[] = ['woman', 'man', 'non-binary', 'unspecified'];

describe('guided character visual catalog', () => {
  it.each(profiles)(
    'offers exactly six tailored body, hair, and outfit choices for %s',
    (profile) => {
      for (const category of ['bodyShape', 'hair', 'outfit'] as const) {
        const choices = getSuggestedOptions(category, profile);
        expect(choices).toHaveLength(6);
        expect(new Set(choices.map((choice) => choice.id))).toHaveProperty('size', 6);
        expect(choices.every((choice) => choice.profile === profile)).toBe(true);
        expect(choices.every((choice) => choice.imageSrc.endsWith('.webp'))).toBe(true);
      }
    },
  );

  it.each(profiles)('offers six suggestions for every open-ended category for %s', (profile) => {
    for (const category of [
      'appearance',
      'skinTone',
      'bodyShape',
      'hair',
      'hairColor',
      'outfit',
      'accessories',
      'role',
      'style',
      'expression',
      'mood',
      'background',
    ] as const) {
      expect(getSuggestedOptions(category, profile), `${profile} ${category}`).toHaveLength(6);
    }
  });

  it.each(profiles)(
    'uses optimized local artwork for every visual suggestion for %s',
    (profile) => {
      for (const category of [
        'adultAge',
        'appearance',
        'skinTone',
        'bodyShape',
        'hair',
        'outfit',
        'accessories',
        'role',
        'style',
        'expression',
        'mood',
        'background',
      ] as const) {
        const imageSources = getSuggestedOptions(category, profile).map((choice) =>
          getVisualOptionImageSrc(choice, profile),
        );
        expect(imageSources.every((source) => source.startsWith('/guided-character/'))).toBe(true);
        expect(imageSources.every((source) => source.endsWith('.webp'))).toBe(true);
      }
    },
  );

  it('retains the exact four existing adult age choices for every profile', () => {
    for (const profile of profiles) {
      const choices = getSuggestedOptions('adultAge', profile);
      expect(choices.map((choice) => choice.label)).toEqual([
        'Adult',
        'Young adult',
        'Middle-aged adult',
        'Older adult',
      ]);
      expect(getVisualOptionImageSrc(choices[0]!, profile)).toContain(
        `/ages/${profile}/adult.webp`,
      );
    }
  });

  it('stores local unspecified artwork for every profile-rendered shared option', () => {
    const profileRenderedShared = [
      ['adultAge', 'ages'],
      ['role', 'roles'],
      ['style', 'styles'],
      ['expression', 'expressions'],
      ['mood', 'moods'],
      ['background', 'backgrounds'],
    ] as const;

    for (const [category, assetDirectory] of profileRenderedShared) {
      const choices = getSuggestedOptions(category, 'woman');
      expect(choices.length).toBeGreaterThan(0);
      expect(
        choices.every((choice) =>
          choice.imageSrc.startsWith(`/guided-character/${assetDirectory}/unspecified/`),
        ),
      ).toBe(true);
      expect(choices.every((choice) => choice.imageSrc.endsWith('.webp'))).toBe(true);
    }
  });

  it('keeps hairstyle and hair color independent', () => {
    const womanHair = getSuggestedOptions('hair', 'woman');
    const manHair = getSuggestedOptions('hair', 'man');
    expect(womanHair.map((choice) => choice.label)).toEqual([
      'Pixie',
      'Bob',
      'Shoulder-length straight',
      'Long waves',
      'Natural curls',
      'Braids',
    ]);
    expect(manHair.map((choice) => choice.label)).toEqual([
      'Shaved/buzzed',
      'Short crop',
      'Fade',
      'Side part',
      'Textured medium',
      'Shoulder-length',
    ]);
    for (const profile of profiles) {
      expect(getSuggestedOptions('hairColor', profile).map((choice) => choice.label)).toEqual([
        'Black',
        'Dark brown',
        'Light brown',
        'Blonde',
        'Auburn/red',
        'Gray/silver',
      ]);
    }
  });

  it('offers six shared skin-tone images without gender filtering', () => {
    const expected = ['Deep', 'Deep brown', 'Medium brown', 'Olive / tan', 'Light-medium', 'Light'];
    for (const profile of profiles) {
      const choices = getSuggestedOptions('skinTone', profile);
      expect(choices.map((choice) => choice.label)).toEqual(expected);
      expect(choices.every((choice) => choice.profile === 'shared')).toBe(true);
      expect(choices.every((choice) => choice.imageSrc.endsWith('.webp'))).toBe(true);
    }
  });

  it('uses profile-specific body-shape prompt fragments', () => {
    expect(getSuggestedOptions('bodyShape', 'woman')[0]?.promptFragment).toBe(
      'adult woman with a slender body shape',
    );
    expect(getSuggestedOptions('bodyShape', 'man')[0]?.promptFragment).toBe(
      'adult man with a lean body shape',
    );
    expect(getSuggestedOptions('bodyShape', 'non-binary')[0]?.promptFragment).toBe(
      'non-binary adult with a lean body shape',
    );
    expect(getSuggestedOptions('bodyShape', 'unspecified')[0]?.promptFragment).toBe(
      'adult with a slender body shape',
    );
  });

  it('uses distinct profile-specific outfit cuts and prompt fragments', () => {
    const professional = profiles.map(
      (profile) => getSuggestedOptions('outfit', profile)[0]?.promptFragment,
    );
    expect(new Set(professional)).toHaveProperty('size', 4);
    expect(professional).toEqual([
      "tailored women's blazer and trousers with a defined silhouette",
      "tailored men's suit separates with a structured silhouette",
      'androgynous tailored separates with a balanced silhouette',
      'presentation-neutral tailored separates',
    ]);
  });

  it('renders shared semantic choices with the active profile without changing their IDs', () => {
    const role = getSuggestedOptions('role', 'woman')[0];
    expect(role).toBeDefined();
    expect(role?.profile).toBe('shared');
    expect(role?.imageSrc).toBe('/guided-character/roles/unspecified/presenter.webp');
    expect(getVisualOptionImageSrc(role!, 'woman')).toContain('/roles/woman/presenter.webp');
    expect(getVisualOptionImageSrc(role!, 'man')).toContain('/roles/man/presenter.webp');
    expect(getVisualOptionAlt(role!, 'non-binary')).toMatch(/non-binary adult/i);
    expect(role?.id).toBe('shared.role.presenter');
  });

  it('keeps shared complexion choices available without displacing tailored suggestions', () => {
    for (const profile of profiles) {
      expect(getSuggestedOptions('appearance', profile)).toHaveLength(6);
      const all = getAllOptionsGroupedByProfile('appearance');
      expect(all.shared.map((choice) => choice.label)).toContain('Deep complexion');
    }
  });

  it('pins an out-of-suggestion choice instead of erasing it after profile changes', () => {
    const pixie = getSuggestedOptions('hair', 'woman')[0];
    expect(pixie).toBeDefined();
    const choice = { optionId: pixie?.id ?? '' };
    const preserved = preserveChoiceForProfile('hair', 'man', choice);
    const visible = getVisibleOptions('hair', 'man', choice, false);

    expect(preserved.choice).toEqual(choice);
    expect(preserved.outsideSuggestions).toBe(true);
    expect(visible.currentOutsideSuggestions?.label).toBe('Pixie');
    expect(visible.suggested).toHaveLength(6);
  });

  it('preserves custom text exactly while exposing a trimmed display value', () => {
    const choice = createCustomGuidedChoice('  silver-blue undercut  ');
    const resolved = resolveGuidedChoice('hair', 'non-binary', choice);
    expect(resolved.choice).toEqual(choice);
    expect(resolved.customValue).toBe('silver-blue undercut');
    expect(resolved.outsideSuggestions).toBe(false);
  });

  it('defines nine starters whose catalog-backed defaults all resolve', () => {
    expect(CHARACTER_STARTERS).toHaveLength(9);
    expect(new Set(CHARACTER_STARTERS.map((starter) => starter.id))).toHaveProperty('size', 9);
    for (const starter of CHARACTER_STARTERS) {
      expect(starter.imageSrcByProfile.woman).toContain('/starters/woman/');
      for (const [category, choice] of Object.entries(starter.choices)) {
        if (!choice) continue;
        expect(
          VISUAL_CATALOG.some(
            (candidate) =>
              candidate.category === (category as GuidedChoiceKey) &&
              candidate.id === choice.optionId,
          ),
        ).toBe(true);
      }
    }
  });

  it('ships every referenced raster locally and keeps each optimized asset small', () => {
    const sources = new Set<string>();
    for (const option of VISUAL_CATALOG) {
      if (option.swatch) continue;
      for (const profile of profiles) {
        const source = getVisualOptionImageSrc(option, profile);
        if (source.startsWith('/guided-character/')) sources.add(source);
      }
    }
    for (const starter of CHARACTER_STARTERS) {
      for (const source of Object.values(starter.imageSrcByProfile)) sources.add(source);
    }

    expect(sources.size).toBeGreaterThan(250);
    for (const source of sources) {
      const asset = fileURLToPath(new URL(`../../../public/${source.slice(1)}`, import.meta.url));
      const stats = statSync(asset);
      expect(stats.isFile(), source).toBe(true);
      expect(stats.size, `${source} should be optimized for local reuse`).toBeLessThan(64 * 1_024);
    }
  });
});
