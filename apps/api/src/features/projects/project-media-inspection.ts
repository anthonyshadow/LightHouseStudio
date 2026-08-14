import { createWriteStream } from 'node:fs';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { InspectedVideo } from '@studio/contracts';
import type { AssetReadHandle } from '../../storage/asset-byte-store.js';
import type { StoredVideoVersion } from '../saved-videos/saved-video-repository.js';

export const storedVideoVersionMatchesInspection = (
  version: StoredVideoVersion,
  inspected: InspectedVideo,
  asset: AssetReadHandle,
): boolean =>
  version.assetId === asset.manifest.assetId &&
  version.mimeType === inspected.mimeType &&
  version.sizeBytes === inspected.sizeBytes &&
  version.durationMs === Math.round(inspected.durationMs) &&
  version.width === inspected.width &&
  version.height === inspected.height;

/** Copies an owner-scoped retained asset into a private inspection file and always removes it. */
export const inspectStoredProjectMedia = async (
  asset: AssetReadHandle,
  inspect: (filePath: string) => Promise<InspectedVideo>,
): Promise<InspectedVideo> => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-project-media-'));
  await chmod(directory, 0o700);
  const filePath = path.join(directory, 'media');
  try {
    await pipeline(asset.createReadStream(), createWriteStream(filePath, { mode: 0o600 }));
    return await inspect(filePath);
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }
};
