import { describe, expect, it } from 'vitest';
import {
  CORE_VISUAL_SCENARIOS,
  VISUAL_BASELINE_PATHS,
  VISUAL_CASE_MATRIX,
  VISUAL_VIEWPORTS,
} from './studioVisualMatrix';

describe('curated visual matrix integrity', () => {
  it('uses the exact 31-case budget with unique paths and all required core pairs', () => {
    expect(VISUAL_CASE_MATRIX).toHaveLength(31);
    expect(new Set(VISUAL_BASELINE_PATHS).size).toBe(VISUAL_BASELINE_PATHS.length);
    const pairs = new Set(
      VISUAL_CASE_MATRIX.map(({ viewport, scenario }) => `${viewport.id}/${scenario.id}`),
    );
    for (const viewport of VISUAL_VIEWPORTS) {
      for (const scenario of CORE_VISUAL_SCENARIOS) {
        expect(pairs).toContain(`${viewport.id}/${scenario.id}`);
      }
    }
  });
});
