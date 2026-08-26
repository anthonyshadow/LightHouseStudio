import type { CSSObject } from '@emotion/react';
import { describe, expect, it } from 'vitest';
import { pageHeaderStyles } from '../../ui/primitives/PageShell.styles';
import { studioTheme } from '../../ui';
import { dashboardHeaderStyles, dashboardShellStyles } from './DashboardRouteSurface.styles';

const NARROW = '@container (max-width: 30rem)';

const narrow = (styles: CSSObject): CSSObject => (styles[NARROW] ?? {}) as CSSObject;

describe('Dashboard header styles', () => {
  /**
   * The compact actions row has one owner. `PageHeader` lays it out for every surface — the
   * leading control takes the free width and peers keep their own — so the Dashboard, which is
   * the surface with the most peers, needs no rule of its own. Two owners tie on specificity and
   * are settled by stylesheet insertion order, which depends on whichever surface mounted first.
   */
  it('leaves the compact actions row to the shared header', () => {
    const shared = narrow(pageHeaderStyles(studioTheme));
    expect(shared['& [data-page-actions]']).toMatchObject({ flexWrap: 'nowrap' });
    // Grows into free width, never shrinks below its own content: the peers are the slack.
    expect(shared['& [data-page-actions] > *:first-child']).toMatchObject({ flex: '1 0 auto' });

    const dashboard = dashboardHeaderStyles(studioTheme);
    expect(narrow(dashboard)['& [data-page-actions]']).toBeUndefined();
    /*
     * Nor may the surface re-size the leading control once the row is compact. The shared rule sets
     * flex, not width, so a rule here would not lose on specificity — it would quietly win, and the
     * compact row would have two owners disagreeing at the width where there is least room.
     */
    const compact = (dashboard['@container (max-width: 22rem)'] ?? {}) as CSSObject;
    expect(compact['& [data-create-video]']).toBeUndefined();
  });

  it('keeps the Dashboard header to what is specific to its own controls', () => {
    const header = JSON.stringify(dashboardHeaderStyles(studioTheme));
    // The wrapper that used to restate the shared row is gone; only the controls remain.
    expect(header).not.toContain('data-dashboard-actions');
    expect(header).toContain('data-create-video');
  });

  it('leaves the shell owning only what the scroll region needs', () => {
    const shell = JSON.stringify(dashboardShellStyles(studioTheme));
    // The fixed bottom navigation would otherwise sit over the last rows of a scrolled Dashboard.
    expect(shell).toContain('safe-area-inset-bottom');
    // The shell carries no rule for the slot, at any width, so it cannot compete from above.
    expect(shell).not.toContain('data-page-actions');
    expect(shell).not.toContain('data-dashboard-actions');
  });
});
