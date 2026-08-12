import { describe, expect, it } from 'vitest';
import {
  APP_PATHS,
  campaignIdFromPath,
  campaignPath,
  isCampaignsPath,
  isProjectsPath,
  isRestorableStudioPath,
  isStudioPath,
  projectIdFromPath,
  projectPath,
} from './paths';

describe('authenticated Studio paths', () => {
  it('recognizes canonical Campaign/Project list/detail and every legacy Studio surface', () => {
    const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
    const campaignId = '20ce94fa-15d1-42c6-abd3-77ff61516b48';
    expect(projectPath(projectId)).toBe(`/studio/projects/${projectId}`);
    expect(projectIdFromPath(projectPath(projectId))).toBe(projectId);
    expect(isProjectsPath(APP_PATHS.projects)).toBe(true);
    expect(isProjectsPath(projectPath(projectId))).toBe(true);
    expect(campaignPath(campaignId)).toBe(`/studio/campaigns/${campaignId}`);
    expect(campaignIdFromPath(campaignPath(campaignId))).toBe(campaignId);
    expect(isCampaignsPath(APP_PATHS.campaigns)).toBe(true);
    expect(isCampaignsPath(campaignPath(campaignId))).toBe(true);
    for (const path of [
      APP_PATHS.studio,
      APP_PATHS.projects,
      projectPath(projectId),
      APP_PATHS.campaigns,
      campaignPath(campaignId),
      APP_PATHS.videos,
      APP_PATHS.characters,
      APP_PATHS.outfits,
    ]) {
      expect(isStudioPath(path)).toBe(true);
      expect(isRestorableStudioPath(path)).toBe(true);
    }
  });

  it('rejects unknown, nested, malformed-encoding, and obsolete paths', () => {
    for (const path of [
      '/studio/unknown',
      '/studio/projects/id/history',
      '/studio/projects/%E0%A4%A',
      '/projects',
      '/advanced',
    ]) {
      expect(isRestorableStudioPath(path)).toBe(false);
    }
    expect(isStudioPath('/studio/future-child')).toBe(true);
    expect(isStudioPath('/projects')).toBe(false);
  });
});
