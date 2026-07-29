import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const expectMissing = async (candidate) => {
  await assert.rejects(access(candidate, constants.F_OK), (error) => error?.code === 'ENOENT');
};

const drillRoot = await mkdtemp(join(tmpdir(), 'lightframe-retirement-drill-'));
const pilotRoot = join(drillRoot, 'pilot-root');
const participantLeaf = join(pilotRoot, 'participant-disposable');
const unrelatedLeaf = join(pilotRoot, 'participant-control');
const sharedSentinel = join(pilotRoot, 'shared-root-sentinel.txt');
const participantAsset = join(
  participantLeaf,
  'reference-images',
  'v1',
  'assets',
  'asset-disposable',
  'content.png',
);
const unrelatedAsset = join(unrelatedLeaf, 'must-remain.txt');
const trashRoot = join(drillRoot, 'trash');
const trashedParticipantLeaf = join(trashRoot, basename(participantLeaf));

try {
  await mkdir(dirname(participantAsset), { recursive: true });
  await mkdir(unrelatedLeaf, { recursive: true });
  await mkdir(trashRoot);
  await writeFile(participantAsset, 'disposable participant bytes');
  await writeFile(unrelatedAsset, 'unrelated participant control');
  await writeFile(sharedSentinel, 'shared pilot root control');

  const resolvedPilotRoot = await realpath(pilotRoot);
  const resolvedParticipantLeaf = await realpath(participantLeaf);
  assert.equal(
    dirname(resolvedParticipantLeaf),
    resolvedPilotRoot,
    'participant target must be one exact leaf below the reviewed pilot root',
  );
  assert.equal(
    basename(resolvedParticipantLeaf),
    'participant-disposable',
    'participant target must match the reviewed disposable code',
  );
  assert.notEqual(resolvedParticipantLeaf, resolvedPilotRoot);

  await rename(resolvedParticipantLeaf, trashedParticipantLeaf);

  await expectMissing(participantLeaf);
  await expectMissing(participantAsset);
  await access(unrelatedAsset, constants.F_OK);
  await access(sharedSentinel, constants.F_OK);

  await rm(trashedParticipantLeaf, { recursive: true });
  await expectMissing(trashedParticipantLeaf);
  await access(unrelatedAsset, constants.F_OK);
  await access(sharedSentinel, constants.F_OK);

  console.log('Pilot data retirement drill: PASS');
  console.log('Verified exact-leaf retirement, retained-ID absence, and shared-root preservation.');
} finally {
  await rm(drillRoot, { recursive: true, force: true });
}
