import { describe, expect, it } from 'vitest';
import { studioTheme } from '../../ui';
import { projectOverviewHeaderStyles } from './ProjectOverviewSurface.styles';
import { projectOverviewRouteStyles, projectsIndexRouteStyles } from './ProjectRouteSurface.styles';
import { projectsLedgerRowStyles } from './ProjectsListSurface.styles';
import { pageHeaderStyles, pageShellStyles } from '../../ui/primitives/PageShell.styles';

describe('Project index responsive ledger styles', () => {
  it('keeps the index flat and establishes a content-width query boundary', () => {
    expect(projectsIndexRouteStyles(studioTheme)).toMatchObject({
      background: studioTheme.colors.canvas,
      containerType: 'inline-size',
    });
    // Flat means the property is absent, not set to zero: a page declares no border at all.
    expect(projectsIndexRouteStyles(studioTheme)).not.toHaveProperty('border');
    expect(projectsIndexRouteStyles(studioTheme)).not.toHaveProperty('borderRadius');
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

describe('Project overview Single Flow styles', () => {
  it('uses the approved flat route and content-width query boundary', () => {
    expect(projectOverviewRouteStyles(studioTheme)).toMatchObject({
      border: 0,
      borderRadius: 0,
      background: studioTheme.colors.canvas,
      containerType: 'inline-size',
    });
    // The page frame is the shared shell now, so the cap is asserted once, where it lives.
    expect(pageShellStyles(studioTheme)).toMatchObject({
      width: 'min(100%, 88rem)',
      marginInline: 'auto',
      gridTemplateColumns: 'minmax(0, 1fr)',
      background: studioTheme.colors.canvas,
      containerType: 'inline-size',
    });
    expect(pageShellStyles(studioTheme)).not.toHaveProperty('border');
    expect(pageShellStyles(studioTheme)).not.toHaveProperty('borderRadius');
  });

  it('gives the title the full content width throughout tablet layouts', () => {
    expect(pageHeaderStyles(studioTheme)).toMatchObject({
      '& [data-page-identity]': {
        gridTemplateColumns: 'minmax(0, 1fr) auto',
      },
      '& h1': { width: '100%', maxWidth: '48rem' },
      '@container (max-width: 64rem)': {
        '& [data-page-identity]': {
          gridTemplateColumns: 'minmax(0, 1fr)',
          alignItems: 'stretch',
        },
        '& h1': { maxWidth: 'none' },
      },
    });
  });

  it('keeps the overview header owning only what it adds to the shared one', () => {
    expect(projectOverviewHeaderStyles(studioTheme)).toMatchObject({
      '& [data-detail-breadcrumb]': { justifySelf: 'start' },
      '& [data-detail-meta]': { display: 'flex' },
    });
  });
});
