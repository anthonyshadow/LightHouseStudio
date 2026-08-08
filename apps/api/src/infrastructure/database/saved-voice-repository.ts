import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { toIsoTimestamp } from '../../application/timestamps.js';
import type {
  SavedVoiceRecord,
  SavedVoiceRepository,
} from '../../features/voices/saved-voice-repository.js';
import type { LightframeDatabase } from './client.js';
import { ownerMigrations, savedVoices } from './schema.js';

const WORKSPACE_MIGRATION_ID = 'elevenlabs-workspace-v1';

const toRecord = (row: typeof savedVoices.$inferSelect): SavedVoiceRecord => ({
  id: row.id,
  ownerUserId: row.ownerUserId,
  provider: 'elevenlabs',
  providerVoiceId: row.providerVoiceId,
  publicOwnerId: row.publicOwnerId,
  savedAt: toIsoTimestamp(row.savedAt),
});

const voiceValues = (
  ownerUserId: string,
  voice: { readonly voiceId: string; readonly publicOwnerId: string | null },
  savedAt: string,
): typeof savedVoices.$inferInsert => ({
  id: randomUUID(),
  ownerUserId,
  provider: 'elevenlabs',
  providerVoiceId: voice.voiceId,
  publicOwnerId: voice.publicOwnerId,
  savedAt: toIsoTimestamp(savedAt),
});

export class DrizzleSavedVoiceRepository implements SavedVoiceRepository {
  constructor(private readonly db: LightframeDatabase) {}

  async list(ownerUserId: string): Promise<readonly SavedVoiceRecord[]> {
    const rows = await this.db
      .select()
      .from(savedVoices)
      .where(and(eq(savedVoices.ownerUserId, ownerUserId), eq(savedVoices.provider, 'elevenlabs')));
    return rows.map(toRecord);
  }

  async has(ownerUserId: string, voiceId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: savedVoices.id })
      .from(savedVoices)
      .where(
        and(
          eq(savedVoices.ownerUserId, ownerUserId),
          eq(savedVoices.provider, 'elevenlabs'),
          eq(savedVoices.providerVoiceId, voiceId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async savedIds(ownerUserId: string, voiceIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (voiceIds.length === 0) return new Set();
    const rows = await this.db
      .select({ voiceId: savedVoices.providerVoiceId })
      .from(savedVoices)
      .where(
        and(
          eq(savedVoices.ownerUserId, ownerUserId),
          eq(savedVoices.provider, 'elevenlabs'),
          inArray(savedVoices.providerVoiceId, [...new Set(voiceIds)]),
        ),
      );
    return new Set(rows.map((row) => row.voiceId));
  }

  async save(
    ownerUserId: string,
    voiceId: string,
    publicOwnerId: string | null,
    savedAt: string,
  ): Promise<'saved' | 'already-saved'> {
    const rows = await this.db
      .insert(savedVoices)
      .values(voiceValues(ownerUserId, { voiceId, publicOwnerId }, savedAt))
      .onConflictDoNothing()
      .returning({ id: savedVoices.id });
    return rows.length === 0 ? 'already-saved' : 'saved';
  }

  async remove(ownerUserId: string, voiceId: string): Promise<'removed' | 'already-removed'> {
    const rows = await this.db
      .delete(savedVoices)
      .where(
        and(
          eq(savedVoices.ownerUserId, ownerUserId),
          eq(savedVoices.provider, 'elevenlabs'),
          eq(savedVoices.providerVoiceId, voiceId),
        ),
      )
      .returning({ id: savedVoices.id });
    return rows.length === 0 ? 'already-removed' : 'removed';
  }

  async migrated(ownerUserId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ migrationId: ownerMigrations.migrationId })
      .from(ownerMigrations)
      .where(
        and(
          eq(ownerMigrations.ownerUserId, ownerUserId),
          eq(ownerMigrations.migrationId, WORKSPACE_MIGRATION_ID),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  async completeMigration(
    ownerUserId: string,
    voices: readonly { voiceId: string; publicOwnerId: string | null }[],
    savedAt: string,
  ): Promise<void> {
    if (voices.length > 0) {
      await this.db
        .insert(savedVoices)
        .values(voices.map((voice) => voiceValues(ownerUserId, voice, savedAt)))
        .onConflictDoNothing();
    }
    await this.db
      .insert(ownerMigrations)
      .values({
        ownerUserId,
        migrationId: WORKSPACE_MIGRATION_ID,
        completedAt: toIsoTimestamp(savedAt),
      })
      .onConflictDoNothing();
  }
}
