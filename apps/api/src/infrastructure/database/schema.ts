import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userPlan = pgEnum('user_plan', ['free', 'plus', 'pro']);
export const userRole = pgEnum('user_role', ['user', 'admin']);
export const userStatus = pgEnum('user_status', ['active', 'disabled']);
export const assetStorageProvider = pgEnum('asset_storage_provider', ['local', 'r2']);
export const assetStatus = pgEnum('asset_status', [
  'pending',
  'ready',
  'missing',
  'deleting',
  'deleted',
  'failed',
]);
export const savedVideoStatus = pgEnum('saved_video_status', ['ready', 'missing', 'deleted']);
export const savedVideoOrigin = pgEnum('saved_video_origin', [
  'recorded',
  'uploaded',
  'character-swap',
  'virtual-try-on',
  'voice-treatment',
  'editor',
  'legacy-import',
]);
export const creativeAssetKind = pgEnum('creative_asset_kind', [
  'saved-prompt',
  'recent-prompt',
  'character',
  'character-variant',
  'outfit',
]);
export const operationStatus = pgEnum('operation_status', [
  'pending',
  'validating',
  'submitting',
  'accepted',
  'ambiguous',
  'queued',
  'processing',
  'retrieving',
  'ready',
  'failed',
  'expired',
  'cancelled',
]);
export const outboxStatus = pgEnum('outbox_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

const auditTimestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    login: text('login').notNull(),
    normalizedLogin: text('normalized_login').notNull(),
    username: text('username').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    planId: userPlan('plan_id').notNull().default('free'),
    role: userRole('role').notNull().default('user'),
    status: userStatus('status').notNull().default('active'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'string' }),
    ...auditTimestamps,
  },
  (table) => [
    uniqueIndex('users_normalized_login_unique').on(table.normalizedLogin),
    uniqueIndex('users_username_unique').on(table.username),
  ],
);

export const passwordCredentials = pgTable('password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  hashScheme: text('hash_scheme').notNull().default('argon2id'),
  ...auditTimestamps,
});

export const sessions = pgTable(
  'sessions',
  {
    jti: uuid('jti').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'string' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
  },
  (table) => [index('sessions_user_expiry_idx').on(table.userId, table.expiresAt)],
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    storageProvider: assetStorageProvider('storage_provider').notNull(),
    storageKey: text('storage_key').notNull(),
    status: assetStatus('status').notNull().default('pending'),
    mimeType: text('mime_type').notNull(),
    filename: text('filename').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksumSha256: text('checksum_sha256').notNull(),
    etag: text('etag'),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    ...auditTimestamps,
  },
  (table) => [
    uniqueIndex('media_assets_storage_key_unique').on(table.storageProvider, table.storageKey),
    index('media_assets_owner_status_idx').on(table.ownerUserId, table.status, table.createdAt),
    index('media_assets_owner_checksum_idx').on(table.ownerUserId, table.checksumSha256),
    check('media_assets_size_positive', sql`${table.sizeBytes} > 0`),
  ],
);

export const savedVideos = pgTable(
  'saved_videos',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    currentVersionId: uuid('current_version_id').notNull(),
    sourceVideoId: uuid('source_video_id'),
    status: savedVideoStatus('status').notNull(),
    revision: integer('revision').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    ...auditTimestamps,
  },
  (table) => [
    index('saved_videos_gallery_idx').on(
      table.ownerUserId,
      table.deletedAt,
      table.createdAt,
      table.id,
    ),
    index('saved_videos_owner_status_idx').on(table.ownerUserId, table.status),
  ],
);

export const videoVersions = pgTable(
  'video_versions',
  {
    id: uuid('id').primaryKey(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => savedVideos.id, { onDelete: 'restrict' }),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ordinal: integer('ordinal').notNull(),
    origin: savedVideoOrigin('origin').notNull(),
    characterName: text('character_name'),
    sourceVersionId: uuid('source_version_id'),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    thumbnailAssetId: uuid('thumbnail_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    mimeType: text('mime_type').notNull(),
    filename: text('filename').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('video_versions_ordinal_unique').on(table.videoId, table.ordinal),
    index('video_versions_character_idx').on(table.ownerUserId, table.characterName),
    index('video_versions_duration_idx').on(table.ownerUserId, table.durationMs, table.id),
  ],
);

export const savedVideoReceipts = pgTable(
  'saved_video_receipts',
  {
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    videoId: uuid('video_id')
      .notNull()
      .references(() => savedVideos.id, { onDelete: 'restrict' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => videoVersions.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ownerUserId, table.idempotencyKey] })],
);

export const savedVoices = pgTable(
  'saved_voices',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerVoiceId: text('provider_voice_id').notNull(),
    publicOwnerId: text('public_owner_id'),
    savedAt: timestamp('saved_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [
    uniqueIndex('saved_voices_owner_provider_voice_unique').on(
      table.ownerUserId,
      table.provider,
      table.providerVoiceId,
    ),
  ],
);

export const ownerMigrations = pgTable(
  'owner_migrations',
  {
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    migrationId: text('migration_id').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ownerUserId, table.migrationId] })],
);

export const creativeAssets = pgTable(
  'creative_assets',
  {
    id: text('id').notNull(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: creativeAssetKind('kind').notNull(),
    revision: integer('revision').notNull(),
    schemaVersion: integer('schema_version').notNull(),
    payload: jsonb('payload').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    ...auditTimestamps,
  },
  (table) => [
    primaryKey({ columns: [table.ownerUserId, table.kind, table.id] }),
    index('creative_assets_owner_kind_idx').on(
      table.ownerUserId,
      table.kind,
      table.deletedAt,
      table.updatedAt,
    ),
  ],
);

export const creativeLibraries = pgTable('creative_libraries', {
  ownerUserId: uuid('owner_user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull().default(0),
  schemaVersion: integer('schema_version').notNull(),
  ...auditTimestamps,
});

export const referenceImageAssets = pgTable(
  'reference_image_assets',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    requestId: uuid('request_id').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    mediaAssetId: uuid('media_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    metadata: jsonb('metadata').notNull(),
    ...auditTimestamps,
  },
  (table) => [
    uniqueIndex('reference_images_owner_request_unique').on(table.ownerUserId, table.requestId),
  ],
);

export const processingJobs = pgTable(
  'processing_jobs',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    operation: text('operation').notNull(),
    provider: text('provider').notNull(),
    providerJobId: text('provider_job_id'),
    requestFingerprint: text('request_fingerprint'),
    outputResolution: text('output_resolution'),
    providerOutputLocation: text('provider_output_location'),
    sourceDurationMs: integer('source_duration_ms'),
    sourceOrientation: text('source_orientation'),
    status: operationStatus('status').notNull(),
    safeErrorCode: text('safe_error_code'),
    inputAssetId: uuid('input_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    outputAssetId: uuid('output_asset_id').references(() => mediaAssets.id, {
      onDelete: 'restrict',
    }),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true, mode: 'string' }),
    attempt: integer('attempt').notNull().default(0),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    ...auditTimestamps,
  },
  (table) => [
    index('processing_jobs_owner_status_idx').on(table.ownerUserId, table.status, table.createdAt),
    index('processing_jobs_lease_idx').on(table.status, table.leaseExpiresAt),
    uniqueIndex('processing_jobs_owner_active_unique')
      .on(table.ownerUserId)
      .where(
        sql`${table.status} in ('pending', 'validating', 'submitting', 'accepted', 'queued', 'processing', 'retrieving')`,
      ),
  ],
);

export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    topic: text('topic').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload').notNull(),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string' }),
    lastSafeErrorCode: text('last_safe_error_code'),
    ...auditTimestamps,
  },
  (table) => [index('outbox_pending_idx').on(table.status, table.availableAt)],
);

export const resourceReferences = pgTable(
  'resource_references',
  {
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    targetAssetId: uuid('target_asset_id')
      .notNull()
      .references(() => mediaAssets.id, { onDelete: 'restrict' }),
    purpose: text('purpose').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.ownerUserId,
        table.sourceType,
        table.sourceId,
        table.targetAssetId,
        table.purpose,
      ],
    }),
    index('resource_references_target_idx').on(table.ownerUserId, table.targetAssetId),
  ],
);

export const databaseSchema = {
  users,
  passwordCredentials,
  sessions,
  mediaAssets,
  savedVideos,
  videoVersions,
  savedVideoReceipts,
  savedVoices,
  ownerMigrations,
  creativeAssets,
  creativeLibraries,
  referenceImageAssets,
  processingJobs,
  outbox,
  resourceReferences,
};
