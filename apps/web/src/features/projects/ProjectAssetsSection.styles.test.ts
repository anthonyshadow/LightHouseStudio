import { describe, expect, it } from 'vitest';
import { studioTheme } from '../../ui';
import {
  projectAssetFiltersStyles,
  projectAssetGridStyles,
  projectAssetItemStyles,
} from './ProjectAssetsSection.styles';

describe('Project Assets Single Flow styles', () => {
  it('keeps asset entries flat while retaining a responsive gallery', () => {
    expect(projectAssetItemStyles(studioTheme)).toMatchObject({
      padding: 0,
      border: 0,
      borderRadius: 0,
      background: 'transparent',
      boxShadow: 'none',
    });
    expect(projectAssetGridStyles(studioTheme)).toMatchObject({
      gridTemplateColumns: 'minmax(0, 1fr)',
      '@container (min-width: 32rem)': {
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      },
      '@container (min-width: 58rem)': {
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      },
      '@container (min-width: 78rem)': {
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      },
    });
  });

  it('uses the approved underline filters without rounded button boxes', () => {
    expect(projectAssetFiltersStyles(studioTheme)).toMatchObject({
      overflowX: 'auto',
      borderBlockEnd: `1px solid ${studioTheme.colors.border}`,
      '& > button': {
        border: 0,
        borderRadius: 0,
        background: 'transparent',
        '&[aria-pressed="true"]::after': { background: studioTheme.colors.accent },
      },
    });
  });
});
