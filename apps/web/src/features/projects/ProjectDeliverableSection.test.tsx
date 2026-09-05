// @vitest-environment jsdom

import type { ProjectCurrentResponse, ProjectOutputHistoryItem } from '@studio/contracts';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { captureRequests, jsonScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { ProjectDeliverableSection } from './ProjectDeliverableSection';

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const savedVideoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const variantSetId = '5b2d9e14-6c3a-4f81-9b27-3d5e7a0c1f92';
const now = '2026-08-14T12:00:00.000Z';

const current: ProjectCurrentResponse = {
  project: {
    id: projectId,
    campaignId: null,
    title: 'Launch Project',
    status: 'ready',
    version: 2,
    currentRevisionId: revisionId,
    currentRevisionNumber: 2,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: revisionId,
    projectId,
    revisionNumber: 2,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId,
      workingMedia: { kind: 'asset', assetId: sourceAssetId },
      presentedMedia: { kind: 'asset', assetId: sourceAssetId },
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'none' },
      liveMode: null,
      creativeIntent: {
        promptId: null,
        promptLabel: null,
        recipeId: null,
        recipeLabel: null,
        userIntent: '',
        appliedPrompt: null,
        referenceAssetId: null,
        resourceRevision: null,
      },
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: 'review',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
};

const PLACEMENTS = {
  '9:16': { width: 1_080, height: 1_920 },
  '1:1': { width: 1_080, height: 1_080 },
  '4:5': { width: 1_080, height: 1_350 },
} as const;

/**
 * One saved Version as the outputs feed states it. Members of one set share a `variantSetId` and
 * sit at consecutive ordinals, newest first, with the highest ordinal as the set's primary.
 */
const savedOutput = (
  aspect: keyof typeof PLACEMENTS,
  ordinal: number,
  versionId: string,
  set: string | null,
): ProjectOutputHistoryItem => ({
  kind: 'saved-video-version',
  output: {
    projectId,
    savedVideoId,
    videoVersionId: versionId,
    producingRevisionId: revisionId,
    producingRevisionNumber: 2,
    createdAt: now,
  },
  savedVideo: {
    id: savedVideoId,
    title: 'Launch cut',
    libraryStatus: 'ready',
    currentVersionId: versionId,
  },
  version: {
    id: versionId,
    videoId: savedVideoId,
    ordinal,
    origin: 'editor',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: `launch-cut-${ordinal}.mp4`,
    sizeBytes: 2_048,
    durationMs: 10_000,
    width: PLACEMENTS[aspect].width,
    height: PLACEMENTS[aspect].height,
    exportSpecification: {
      container: 'video/mp4',
      aspect,
      resolution: PLACEMENTS[aspect],
      includeAudio: true,
    },
    variantSetId: set,
    createdAt: now,
  },
  referenceRevision: null,
  isCurrentForProject: true,
  thumbnailAvailable: true,
  contentUrl: `/api/projects/${projectId}/outputs/${versionId}/content`,
});

const phoneVersionId = '7c1f2b64-3f9a-4b2e-9d51-0a8c6e2f4b10';
const squareVersionId = '3edb9c78-efb2-43a4-8074-acba56158245';
const tallVersionId = 'd41f9a3b-9c1e-4f2a-8d55-2b7e6c9a0f14';

const renderSection = () => {
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:projectId',
        element: <ProjectDeliverableSection current={current} archived={false} />,
      },
      { path: '/assets/videos', element: <p>Videos library</p> },
    ],
    { initialEntries: [`/projects/${projectId}`] },
  );
  render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <RouterProvider router={router} />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );
  return router;
};

afterEach(cleanup);

describe('ProjectDeliverableSection', () => {
  it('shows every placement one save produced, under one poster', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        `/api/projects/${projectId}/outputs`,
        {
          body: {
            outputs: [
              savedOutput('9:16', 3, phoneVersionId, variantSetId),
              savedOutput('4:5', 2, tallVersionId, variantSetId),
              savedOutput('1:1', 1, squareVersionId, variantSetId),
            ],
            nextCursor: null,
          },
        },
        observe,
      ),
    );
    renderSection();

    const section = await screen.findByRole('region', { name: 'Saved output' });
    // One page has to be able to hold the largest set a save can produce.
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(new URL(requests[0]!.url).searchParams.get('pageSize')).toBe('5');

    // One save of one cut: one poster, the primary's.
    const posters = within(section).getAllByRole('img');
    expect(posters).toHaveLength(1);
    expect(posters[0]).toHaveAccessibleName('Thumbnail for Launch cut');
    expect(posters[0]!.querySelector('img')).toHaveAttribute(
      'src',
      `/api/videos/${savedVideoId}/versions/${phoneVersionId}/thumbnail`,
    );
    // The header stops calling a save of several placements "the video".
    expect(within(section).queryByText(/The video this Project has saved/u)).toBeNull();
    expect(within(section).getByText(/in every placement that save produced/u)).toBeVisible();

    const placements = within(section).getByRole('list', { name: 'Placements saved together' });
    const rows = within(placements).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // Write order, as the set was produced.
    expect(rows[0]).toHaveTextContent('Square post · Version 1 · 1080×1080');
    expect(rows[1]).toHaveTextContent('Tall feed post · Version 2 · 1080×1350');
    expect(rows[2]).toHaveTextContent('Phone, full screen · Version 3 · 1080×1920');
    for (const [index, versionId] of [squareVersionId, tallVersionId, phoneVersionId].entries()) {
      expect(
        within(rows[index]!).getByRole('link', {
          name: `Download Launch cut, Version ${index + 1}`,
        }),
      ).toHaveAttribute(
        'href',
        `/api/projects/${projectId}/outputs/${versionId}/content?download=true`,
      );
    }
    expect(within(section).getByRole('button', { name: 'View in Assets' })).toBeVisible();
  });

  it('leaves a save that produced one placement exactly as it was', async () => {
    mockApiServer.use(
      jsonScenario('GET', `/api/projects/${projectId}/outputs`, {
        body: {
          outputs: [savedOutput('9:16', 3, phoneVersionId, variantSetId)],
          nextCursor: null,
        },
      }),
    );
    renderSection();

    const section = await screen.findByRole('region', { name: 'Saved output' });
    expect(await within(section).findByRole('heading', { name: 'Launch cut' })).toBeVisible();
    // A single-placement save carries a set id too, and one Version was saved together with nothing.
    expect(within(section).queryByRole('list', { name: 'Placements saved together' })).toBeNull();
    expect(within(section).queryByText('Saved together')).toBeNull();
    expect(within(section).getByText(/The video this Project has saved/u)).toBeVisible();
    expect(
      within(section).getByRole('link', { name: 'Download Launch cut, Version 3' }),
    ).toHaveAttribute(
      'href',
      `/api/projects/${projectId}/outputs/${phoneVersionId}/content?download=true`,
    );
  });

  it('recovers a failed read of what the Project saved', async () => {
    mockApiServer.use(
      jsonScenario('GET', `/api/projects/${projectId}/outputs`, [
        {
          status: 503,
          body: { error: { code: 'temporarily_unavailable', message: 'Try again.' } },
        },
        {
          body: {
            outputs: [
              savedOutput('9:16', 2, phoneVersionId, variantSetId),
              savedOutput('1:1', 1, squareVersionId, variantSetId),
            ],
            nextCursor: null,
          },
        },
      ]),
    );
    renderSection();

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent('What this Project has saved could not be read just now.');
    fireEvent.click(within(failure).getByRole('button', { name: 'Retry' }));

    const placements = await screen.findByRole('list', { name: 'Placements saved together' });
    expect(within(placements).getAllByRole('listitem')).toHaveLength(2);
  });
});
