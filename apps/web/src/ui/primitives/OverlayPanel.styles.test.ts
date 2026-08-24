import type { CSSObject } from '@emotion/react';
import { describe, expect, it } from 'vitest';
import { media } from '../media';
import { studioTheme } from '../theme';
import { panelStyles } from './OverlayPanel.styles';

/** The four width bands `panelStyles` answers a height for, innermost declaration last. */
const TIERS = {
  base: null,
  compact: media.downOrShort('desktop', '48rem'),
  tablet: media.between('tablet', 'laptop'),
  mobile: media.down('tablet'),
} as const;

const heightAt = (styles: CSSObject, tier: keyof typeof TIERS): unknown => {
  const query = TIERS[tier];
  if (query === null) return styles['height'];
  return (styles[query] as CSSObject | undefined)?.['height'];
};

const maxHeightAt = (styles: CSSObject, tier: keyof typeof TIERS): unknown => {
  const query = TIERS[tier];
  if (query === null) return styles['maxHeight'];
  return (styles[query] as CSSObject | undefined)?.['maxHeight'];
};

describe('bottom panel height', () => {
  /**
   * A `sheet` promises to leave the surface behind it visible. It once said so at two of the four
   * tiers, and the tablet block — emitted last of the two that overlap, and the only band with no
   * visual baseline — silently returned a full-height panel instead. Asserting every tier is the
   * point of this test: a height mode answered at some widths only is the defect.
   */
  it.each(['base', 'compact', 'tablet', 'mobile'] as const)(
    'keeps a sheet at sheet height on the %s tier',
    (tier) => {
      const styles = panelStyles(studioTheme, 'bottom', 'wide', 'sheet', 'entering');
      expect(heightAt(styles, tier)).toBe(studioTheme.layout.overlays.bottomSheet);
      expect(maxHeightAt(styles, tier)).toBe(studioTheme.layout.overlays.bottomSheet);
    },
  );

  it('leaves every other bottom panel taking the phone, which is what a sheet opts out of', () => {
    const standard = panelStyles(studioTheme, 'bottom', 'wide', 'standard', 'entering');
    expect(heightAt(standard, 'mobile')).toBe('100%');
    expect(heightAt(standard, 'tablet')).toBe(studioTheme.layout.overlays.bottomTablet);
    expect(heightAt(standard, 'compact')).toBe(studioTheme.layout.overlays.bottomCompact);
    expect(heightAt(standard, 'base')).toBe(studioTheme.layout.overlays.bottom);
  });

  it('keeps a tall panel tall at every tier', () => {
    const tall = panelStyles(studioTheme, 'bottom', 'wide', 'tall', 'entering');
    for (const tier of ['base', 'compact', 'tablet', 'mobile'] as const) {
      expect(heightAt(tall, tier)).toBe('75dvh');
    }
  });

  it('gives a sheet its own edge on a phone, where other bottom panels have none', () => {
    const sheet = panelStyles(studioTheme, 'bottom', 'wide', 'sheet', 'entering');
    const standard = panelStyles(studioTheme, 'bottom', 'wide', 'standard', 'entering');
    const mobile = (styles: CSSObject) => styles[TIERS.mobile] as CSSObject;

    expect(mobile(sheet)['border']).toBe(`1px solid ${studioTheme.colors.border}`);
    expect(mobile(sheet)['borderRadius']).toBe(
      `${studioTheme.radii.large} ${studioTheme.radii.large} 0 0`,
    );
    expect(mobile(standard)['border']).toBe(0);
    expect(mobile(standard)['borderRadius']).toBe(0);
  });
});
