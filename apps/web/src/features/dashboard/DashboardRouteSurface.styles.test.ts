import type { CSSObject } from '@emotion/react';
import { describe, expect, it } from 'vitest';
import { pageHeaderStyles } from '../../ui/primitives/PageShell.styles';
import { studioTheme } from '../../ui';
import { dashboardHeaderStyles, dashboardShellStyles } from './DashboardRouteSurface.styles';

const NARROW = '@container (max-width: 30rem)';

const narrow = (styles: CSSObject): CSSObject => (styles[NARROW] ?? {}) as CSSObject;

describe('Dashboard header styles', () => {
  /**
   * The Dashboard is the one surface whose actions slot holds two peer controls, so it opts out of
   * the shared one-primary grid. That override has to be declared on the same element the shared
   * rule targets: from an ancestor the two tie on specificity and are settled by stylesheet
   * insertion order, which depends on whichever surface first mounted a `PageHeader`.
   */
  it('declares the actions-slot override beside the rule it overrides, not on the shell', () => {
    expect(narrow(pageHeaderStyles(studioTheme))['& [data-page-actions]']).toMatchObject({
      display: 'grid',
    });
    expect(narrow(dashboardHeaderStyles(studioTheme))['& [data-page-actions]']).toMatchObject({
      display: 'flex',
    });

    // The shell carries no rule for the slot, at any width, so it cannot compete from above.
    expect(JSON.stringify(dashboardShellStyles())).not.toContain('data-page-actions');
  });

  it('leaves the shell owning only what the scroll region needs', () => {
    const shell = dashboardShellStyles();
    // The fixed bottom navigation would otherwise sit over the last rows of a scrolled Dashboard.
    expect(JSON.stringify(shell)).toContain('safe-area-inset-bottom');
    expect(JSON.stringify(shell)).not.toContain('data-dashboard-actions');
  });
});
