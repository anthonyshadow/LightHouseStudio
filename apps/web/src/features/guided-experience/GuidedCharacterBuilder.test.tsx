// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { createPromptBuilderDraft, type CharacterTransformDraft } from '@studio/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { GuidedDesignV1 } from '../guided-flow';
import { createEmptyGuidedDesign, GuidedCharacterBuilder } from './GuidedCharacterBuilder';

type BuilderSnapshot = {
  draft: CharacterTransformDraft;
  design: GuidedDesignV1;
};

const BuilderHarness = ({
  initialDesign = createEmptyGuidedDesign(),
}: {
  initialDesign?: GuidedDesignV1;
}) => {
  const [draft, setDraft] = useState(() => createPromptBuilderDraft('character-transform'));
  const [design, setDesign] = useState(initialDesign);

  return (
    <StudioDesignProvider>
      <GuidedCharacterBuilder
        draft={draft}
        design={design}
        onChange={(nextDraft, nextDesign) => {
          setDraft(nextDraft);
          setDesign(nextDesign);
        }}
      />
      <output data-testid="builder-state">{JSON.stringify({ draft, design })}</output>
    </StudioDesignProvider>
  );
};

const sectionNamed = (name: string): HTMLElement => {
  const section = screen.getByRole('heading', { name }).closest('section');
  if (!(section instanceof HTMLElement)) throw new Error(`Missing section: ${name}`);
  return section;
};

const readSnapshot = (): BuilderSnapshot =>
  JSON.parse(screen.getByTestId('builder-state').textContent ?? '') as BuilderSnapshot;

const openSection = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  const section = sectionNamed(name);
  const drawer = section.querySelector('details');
  if (drawer && !drawer.open) {
    const summary = drawer.querySelector('summary');
    if (!(summary instanceof HTMLElement)) throw new Error(`Missing drawer summary: ${name}`);
    await user.click(summary);
  }
  return within(section);
};

afterEach(cleanup);

describe('GuidedCharacterBuilder', () => {
  it('lets every option category open and close as an independent drawer', async () => {
    const user = userEvent.setup();
    render(<BuilderHarness />);

    const categories = [
      'Start with a character',
      'Presentation',
      'Adult age',
      'Appearance',
      'Skin tone',
      'Body shape',
      'Hairstyle',
      'Hair color',
      'Outfit',
      'Accessories',
      'Role',
      'Style',
      'Expression',
      'Mood / vibe',
      'Background',
      'Preserve and constraints',
    ];
    for (const category of categories) {
      expect(sectionNamed(category).querySelector('details')).toBeInTheDocument();
    }

    const hairDrawer = sectionNamed('Hairstyle').querySelector('details');
    const bodyDrawer = sectionNamed('Body shape').querySelector('details');
    expect(hairDrawer).not.toHaveAttribute('open');
    expect(bodyDrawer).not.toHaveAttribute('open');

    await openSection(user, 'Hairstyle');
    expect(hairDrawer).toHaveAttribute('open');
    expect(bodyDrawer).not.toHaveAttribute('open');
    await user.click(sectionNamed('Hairstyle').querySelector('summary')!);
    expect(hairDrawer).not.toHaveAttribute('open');
  });

  it('renders all nine starters and six profile-aware suggestions', async () => {
    const user = userEvent.setup();
    render(<BuilderHarness />);

    expect(within(sectionNamed('Start with a character')).getAllByRole('button')).toHaveLength(9);
    const unspecifiedHair = await openSection(user, 'Hairstyle');
    expect(
      unspecifiedHair
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('aria-pressed')),
    ).toHaveLength(6);
    expect(unspecifiedHair.getByRole('button', { name: 'Short' })).toBeInTheDocument();

    await user.click(
      (await openSection(user, 'Presentation')).getByRole('button', {
        name: /Woman representative/,
      }),
    );

    const womanHair = await openSection(user, 'Hairstyle');
    expect(womanHair.getByRole('button', { name: 'Pixie' })).toBeInTheDocument();
    expect(womanHair.getByRole('button', { name: 'Long waves' })).toBeInTheDocument();
    expect(womanHair.queryByRole('button', { name: 'Short crop' })).not.toBeInTheDocument();
    expect(readSnapshot().draft.gender).toBe('woman');
  });

  it('uses a diverse starter montage until presentation is explicitly selected', async () => {
    const user = userEvent.setup();
    render(<BuilderHarness />);

    const starters = within(sectionNamed('Start with a character'));
    const midnightHost = starters.getByRole('button', { name: /Midnight Host/ });
    const montage = within(midnightHost).getByRole('img', {
      name: /Midnight Host, diverse adult presentation montage/i,
    });
    expect(
      Array.from(montage.querySelectorAll('img'), (image) => image.getAttribute('src')),
    ).toEqual([
      '/guided-character/starters/woman/midnight-host.webp',
      '/guided-character/starters/man/midnight-host.webp',
      '/guided-character/starters/non-binary/midnight-host.webp',
      '/guided-character/starters/unspecified/midnight-host.webp',
    ]);
    expect(
      screen.getByRole('img', {
        name: /Character direction preview, diverse adult presentation montage/i,
      }),
    ).toContainHTML('/guided-character/starters/woman/documentary-presenter.webp');

    await user.click(midnightHost);
    expect(readSnapshot()).toMatchObject({
      draft: { gender: null },
      design: { choices: { gender: null } },
    });
    expect(
      within(starters.getByRole('button', { name: /Midnight Host/ })).getByRole('img', {
        name: /diverse adult presentation montage/i,
      }),
    ).toBeInTheDocument();

    const presentation = await openSection(user, 'Presentation');
    const notSpecified = presentation.getByRole('button', {
      name: /Not specified representative/,
    });
    expect(notSpecified).toHaveAttribute('aria-pressed', 'false');
    await user.click(notSpecified);

    const unspecifiedRepresentative = within(
      starters.getByRole('button', { name: /Midnight Host/ }),
    ).getByRole('img', {
      name: /Midnight Host, Not specified presentation representative adult/i,
    });
    expect(unspecifiedRepresentative.querySelectorAll('img')).toHaveLength(1);
    expect(unspecifiedRepresentative.querySelector('img')).toHaveAttribute(
      'src',
      '/guided-character/starters/unspecified/midnight-host.webp',
    );

    await user.click(
      (await openSection(user, 'Presentation')).getByRole('button', {
        name: /Woman representative/,
      }),
    );

    const representative = within(
      starters.getByRole('button', { name: /Midnight Host/ }),
    ).getByRole('img', { name: /Midnight Host, Woman presentation representative adult/i });
    expect(representative.querySelectorAll('img')).toHaveLength(1);
    expect(representative.querySelector('img')).toHaveAttribute(
      'src',
      '/guided-character/starters/woman/midnight-host.webp',
    );
  });

  it('announces presentation changes and the catalog refresh politely', async () => {
    const user = userEvent.setup();
    render(<BuilderHarness />);

    const announcement = document.querySelector<HTMLElement>(
      '[role="status"][aria-live="polite"][aria-atomic="true"]',
    );
    if (!announcement) throw new Error('Missing presentation announcement region');
    expect(announcement).toHaveAttribute('aria-live', 'polite');
    expect(announcement).toHaveAttribute('aria-atomic', 'true');
    expect(announcement).toBeEmptyDOMElement();

    await user.click(
      (await openSection(user, 'Presentation')).getByRole('button', {
        name: /Man representative/,
      }),
    );
    expect(announcement).toHaveTextContent(
      'Man presentation selected. Visual suggestions refreshed. Existing choices were kept.',
    );
    expect(
      (await openSection(user, 'Hairstyle')).getByRole('button', { name: 'Fade' }),
    ).toBeInTheDocument();
  });

  it('keeps hairstyle and hair color independent and preserves an outside choice on gender change', async () => {
    const user = userEvent.setup();
    render(<BuilderHarness />);

    await user.click(
      (await openSection(user, 'Presentation')).getByRole('button', {
        name: /Woman representative/,
      }),
    );
    await user.click((await openSection(user, 'Hairstyle')).getByRole('button', { name: 'Pixie' }));
    await user.click(
      (await openSection(user, 'Hair color')).getByRole('button', { name: 'Blonde' }),
    );

    expect(readSnapshot()).toMatchObject({
      draft: { gender: 'woman', hair: 'pixie', hairColor: 'blonde hair' },
      design: {
        choices: {
          hair: { optionId: 'woman.hair.pixie' },
          hairColor: { optionId: 'shared.hairColor.blonde' },
        },
      },
    });

    await user.click(
      (await openSection(user, 'Presentation')).getByRole('button', {
        name: /Man representative/,
      }),
    );

    expect((await openSection(user, 'Hairstyle')).getByRole('status')).toHaveTextContent(
      /Current choice: Pixie.*Outside current suggestions/i,
    );
    expect(readSnapshot()).toMatchObject({
      draft: { gender: 'man', hair: 'pixie', hairColor: 'blonde hair' },
      design: {
        choices: {
          hair: { optionId: 'woman.hair.pixie' },
          hairColor: { optionId: 'shared.hairColor.blonde' },
        },
      },
    });
  });

  it('supports an exact custom value without changing the independent color choice', async () => {
    const user = userEvent.setup();
    render(<BuilderHarness />);
    const hairstyle = await openSection(user, 'Hairstyle');

    await user.click(hairstyle.getByRole('button', { name: 'Describe My Own' }));
    await user.type(
      hairstyle.getByLabelText('Describe the hairstyle you want'),
      'silver-blue sculpted undercut',
    );
    await user.click(
      (await openSection(user, 'Hair color')).getByRole('button', { name: 'Gray/silver' }),
    );

    expect(readSnapshot()).toMatchObject({
      draft: {
        hair: 'silver-blue sculpted undercut',
        hairColor: 'gray or silver hair',
      },
      design: {
        choices: {
          hair: { optionId: 'custom', customValue: 'silver-blue sculpted undercut' },
          hairColor: { optionId: 'shared.hairColor.gray-silver' },
        },
      },
    });

    await user.clear(hairstyle.getByLabelText('Describe the hairstyle you want'));
    expect(readSnapshot()).toMatchObject({
      draft: { hair: '', hairColor: 'gray or silver hair' },
      design: { choices: { hair: null, hairColor: { optionId: 'shared.hairColor.gray-silver' } } },
    });
  });

  it('keeps exact custom text for every open-ended visual category', async () => {
    const user = userEvent.setup();
    render(<BuilderHarness />);
    const categories = [
      ['Appearance', 'appearance', 'Describe the appearance you want'],
      ['Skin tone', 'skinTone', 'Describe the skin tone you want'],
      ['Body shape', 'bodyShape', 'Describe the body shape you want'],
      ['Hairstyle', 'hair', 'Describe the hairstyle you want'],
      ['Hair color', 'hairColor', 'Describe another hair color'],
      ['Outfit', 'outfit', 'Describe the outfit you want'],
      ['Accessories', 'accessories', 'Describe the accessories you want'],
      ['Role', 'role', 'Describe another role'],
      ['Style', 'style', 'Describe another visual style'],
      ['Expression', 'expression', 'Describe another expression'],
      ['Mood / vibe', 'mood', 'Describe another mood or vibe'],
      ['Background', 'background', 'Describe another background'],
    ] as const;

    for (const [title, key, label] of categories) {
      const category = await openSection(user, title);
      await user.click(category.getByRole('button', { name: 'Describe My Own' }));
      const value = `custom ${key} direction`;
      await user.type(category.getByLabelText(label), value);
      expect(readSnapshot().design.choices[key]).toEqual({
        optionId: 'custom',
        customValue: value,
      });
    }
  });

  it('stores skin tone independently from general appearance', async () => {
    const user = userEvent.setup();
    render(<BuilderHarness />);

    await user.click(
      (await openSection(user, 'Appearance')).getByRole('button', { name: 'Natural' }),
    );
    await user.click(
      (await openSection(user, 'Skin tone')).getByRole('button', { name: 'Medium brown' }),
    );

    expect(readSnapshot()).toMatchObject({
      draft: {
        appearance: 'natural adult appearance with understated grooming',
        skinTone: 'medium brown skin tone',
      },
      design: {
        choices: {
          appearance: { optionId: 'unspecified.appearance.natural' },
          skinTone: { optionId: 'shared.skinTone.medium-brown' },
        },
      },
    });
  });
});
