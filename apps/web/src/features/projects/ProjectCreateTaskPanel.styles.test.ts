import { describe, expect, it } from 'vitest';
import { studioTheme } from '../../ui/theme';
import {
  createLauncherCardStyles,
  createLauncherGridStyles,
  createLauncherSurfaceStyles,
} from './ProjectCreateTaskPanel.styles';

describe('Create task styles', () => {
  it('declares the container context the inspector column does not supply above laptop', () => {
    expect(createLauncherSurfaceStyles(studioTheme).containerType).toBe('inline-size');
  });

  it('steps the launcher grid on its own width, one column at a time', () => {
    const grid = createLauncherGridStyles(studioTheme) as Record<string, Record<string, unknown>>;

    expect(grid['gridTemplateColumns']).toBe('minmax(0, 1fr)');
    expect(grid['& > *']).toEqual({ minWidth: 0 });
    expect(grid['@container (min-width: 34rem)']?.['gridTemplateColumns']).toBe(
      'repeat(2, minmax(0, 1fr))',
    );
    expect(grid['@container (min-width: 58rem)']?.['gridTemplateColumns']).toBe(
      'repeat(3, minmax(0, 1fr))',
    );
  });

  it('lays a card’s own input row out on the card width, not the viewport', () => {
    const card = createLauncherCardStyles(studioTheme) as Record<string, Record<string, unknown>>;
    const wide = card['@container (min-width: 30rem)']?.['& [data-create-launcher-input]'] as
      Record<string, unknown> | undefined;

    expect(wide?.['gridTemplateColumns']).toBe('5.5rem minmax(0, 1fr) auto');
  });

  it('borrows no page tier: a reflow caused by the panel’s own width is a container query', () => {
    for (const styles of [
      createLauncherSurfaceStyles(studioTheme),
      createLauncherGridStyles(studioTheme),
      createLauncherCardStyles(studioTheme),
    ]) {
      expect(Object.keys(styles).filter((key) => key.startsWith('@media'))).toEqual([]);
    }
  });
});
