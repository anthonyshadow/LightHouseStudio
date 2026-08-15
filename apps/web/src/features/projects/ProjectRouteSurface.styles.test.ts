import { describe, expect, it } from 'vitest';
import { studioTheme } from '../../ui';
import {
  projectsHeaderActionsStyles,
  projectsIndexRouteStyles,
  projectsLedgerRowStyles,
  projectsWorkspaceInnerStyles,
} from './ProjectRouteSurface.styles';

describe('Project index responsive ledger styles', () => {
  it('keeps the index flat and establishes a content-width query boundary', () => {
    expect(projectsIndexRouteStyles(studioTheme)).toMatchObject({
      border: 0,
      borderRadius: 0,
      background: studioTheme.colors.canvas,
    });
    expect(projectsWorkspaceInnerStyles(studioTheme)).toMatchObject({
      containerType: 'inline-size',
    });
  });

  it('reflows both creation actions before the tablet content area can clip them', () => {
    expect(projectsHeaderActionsStyles(studioTheme)).toMatchObject({
      '@container (max-width: 52rem)': {
        width: '100%',
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        '& > button': { width: '100%', minWidth: 0 },
      },
      '@container (max-width: 28rem)': {
        gridTemplateColumns: 'minmax(0, 1fr)',
      },
    });
  });

  it('moves ledger rows from one to two to four columns without boxed controls', () => {
    expect(projectsLedgerRowStyles(studioTheme)).toMatchObject({
      gridTemplateColumns: 'minmax(0, 1fr)',
      '& [data-project-actions] > button': {
        minHeight: '2.75rem',
        minWidth: '2.75rem',
        border: 0,
        borderRadius: 0,
      },
      '@container (min-width: 32rem)': {
        gridTemplateColumns: 'minmax(0, 1fr) auto',
      },
      '@container (min-width: 52rem)': {
        gridTemplateColumns: 'minmax(10rem, 1fr) 7.5rem 12rem minmax(17rem, auto)',
      },
    });
  });
});
