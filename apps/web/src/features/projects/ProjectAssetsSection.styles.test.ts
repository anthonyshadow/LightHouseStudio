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
    // The filter row owns spacing only; `SegmentedControl` owns how a chosen filter looks.
    expect(projectAssetFiltersStyles(studioTheme)).toMatchObject({
      minWidth: 0,
      marginBlockEnd: `clamp(${studioTheme.space.xl}, 4cqi, 2.5rem)`,
    });
    expect(projectAssetFiltersStyles(studioTheme)).not.toHaveProperty('& > button');
  });
});
