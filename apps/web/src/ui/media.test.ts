import { describe, expect, it } from 'vitest';
import { media } from './media';
import { studioTheme } from './theme';

describe('media', () => {
  it('emits the theme value upward and its exclusive complement downward', () => {
    expect(media.up('tablet')).toBe('@media (min-width: 40rem)');
    expect(media.down('tablet')).toBe('@media (max-width: 39.99rem)');
    expect(media.up('compact')).toBe('@media (min-width: 48rem)');
    expect(media.down('compact')).toBe('@media (max-width: 47.99rem)');
    expect(media.up('laptop')).toBe('@media (min-width: 64rem)');
    expect(media.down('laptop')).toBe('@media (max-width: 63.99rem)');
    expect(media.down('desktop')).toBe('@media (max-width: 79.99rem)');
    expect(media.down('wide')).toBe('@media (max-width: 99.99rem)');
  });

  it('composes a single tier and a tier-or-short-viewport query from the same values', () => {
    expect(media.between('tablet', 'laptop')).toBe(
      '@media (min-width: 40rem) and (max-width: 63.99rem)',
    );
    expect(media.between('compact', 'laptop')).toBe(
      '@media (min-width: 48rem) and (max-width: 63.99rem)',
    );
    expect(media.downOrShort('tablet', '36rem')).toBe(
      '@media (max-width: 39.99rem), (max-height: 36rem)',
    );
    expect(media.downOrShort('desktop', '48rem')).toBe(
      '@media (max-width: 79.99rem), (max-height: 48rem)',
    );
  });

  it('covers every breakpoint the theme declares, so a new tier cannot be unreachable', () => {
    for (const name of Object.keys(studioTheme.breakpoints) as Array<
      keyof typeof studioTheme.breakpoints
    >) {
      expect(media.up(name)).toContain(studioTheme.breakpoints[name]);
      expect(media.down(name)).toMatch(/^@media \(max-width: \d+(\.\d+)?rem\)$/u);
    }
  });

  it('keeps the tiers ordered, so up(a) and down(b) cannot overlap unintentionally', () => {
    const values = Object.values(studioTheme.breakpoints).map((value) => Number.parseFloat(value));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
