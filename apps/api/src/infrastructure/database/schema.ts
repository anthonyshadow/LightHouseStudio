import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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
export const directUploadStatus = pgEnum('direct_upload_status', [
  'pending',
  'uploading',
  'verifying',
  'ready',
  'failed',
  'aborted',
  'expired',
]);
export const projectStatus = pgEnum('project_status', [
  'draft',
  'ready',
  'processing',
  'needs-attention',
  'completed',
  'archived',
  'deleted',
]);
export const campaignStatus = pgEnum('campaign_status', ['active', 'archived', 'deleted']);
export const projectAssetRole = pgEnum('project_asset_role', [
  'source',
  'working',
  'presented',
  'reference',
  'job-input',
  'job-output',
  'audio',
  'thumbnail',
]);
export const projectVersionReferenceRole = pgEnum('project_version_reference_role', [
  'working',
  'presented',
]);
export const projectRevisionAuthorKind = pgEnum('project_revision_author_kind', [
  'user',
  'system',
  'migration',
]);
export const projectRevisionSource = pgEnum('project_revision_source', [
  'create',
  'user-edit',
  'job-result',
  'restore',
  'migration',
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
    unique('media_assets_id_owner_unique').on(table.id, table.ownerUserId),
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
    unique('saved_videos_id_owner_unique').on(table.id, table.ownerUserId),
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
    characterVariantName: text('character_variant_name'),
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
    unique('video_versions_video_owner_id_unique').on(table.videoId, table.ownerUserId, table.id),
    index('video_versions_asset_idx').on(table.ownerUserId, table.assetId),
    index('video_versions_thumbnail_asset_idx').on(table.ownerUserId, table.thumbnailAssetId),
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

export const directUploads = pgTable(
  'direct_uploads',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assetId: uuid('asset_id').notNull().unique(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    providerUploadId: text('provider_upload_id'),
    status: directUploadStatus('status').notNull().default('pending'),
    expectedMimeType: text('expected_mime_type').notNull(),
    expectedSizeBytes: bigint('expected_size_bytes', { mode: 'number' }).notNull(),
    filename: text('filename').notNull(),
    request: jsonb('request').notNull(),
    resultVideoId: uuid('result_video_id').references(() => savedVideos.id, {
      onDelete: 'restrict',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    ...auditTimestamps,
  },
  (table) => [
    uniqueIndex('direct_uploads_owner_idempotency_unique').on(
      table.ownerUserId,
      table.idempotencyKey,
    ),
    index('direct_uploads_expiry_idx').on(table.status, table.expiresAt),
    check('direct_uploads_size_positive', sql`${table.expectedSizeBytes} > 0`),
  ],
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
    unique('processing_jobs_id_owner_unique').on(table.id, table.ownerUserId),
    index('processing_jobs_owner_status_idx').on(table.ownerUserId, table.status, table.createdAt),
    index('processing_jobs_lease_idx').on(table.status, table.leaseExpiresAt),
    uniqueIndex('processing_jobs_owner_active_unique')
      .on(table.ownerUserId)
      .where(
        sql`${table.status} in ('pending', 'validating', 'submitting', 'accepted', 'queued', 'processing', 'retrieving')`,
      ),
  ],
);

const projectRevisionProjectIdColumn = (): AnyPgColumn => projectRevisions.projectId;
const projectRevisionOwnerUserIdColumn = (): AnyPgColumn => projectRevisions.ownerUserId;
const projectRevisionIdColumn = (): AnyPgColumn => projectRevisions.id;
const projectRevisionNumberColumn = (): AnyPgColumn => projectRevisions.revisionNumber;
const projectIdColumn = (): AnyPgColumn => projects.id;
const projectOwnerUserIdColumn = (): AnyPgColumn => projects.ownerUserId;
const campaignIdColumn = (): AnyPgColumn => campaigns.id;
const campaignOwnerUserIdColumn = (): AnyPgColumn => campaigns.ownerUserId;

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    brief: text('brief'),
    status: campaignStatus('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    ...auditTimestamps,
  },
  (table) => [
    unique('campaigns_id_owner_unique').on(table.id, table.ownerUserId),
    index('campaigns_owner_active_recent_idx')
      .on(table.ownerUserId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} is null and ${table.status} = 'active'`),
    index('campaigns_owner_archived_recent_idx')
      .on(table.ownerUserId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} is null and ${table.status} = 'archived'`),
    check('campaigns_version_positive', sql`${table.version} > 0`),
    check('campaigns_name_length', sql`length(trim(${table.name})) between 1 and 120`),
    check('campaigns_brief_length', sql`${table.brief} is null or length(${table.brief}) <= 1000`),
    check(
      'campaigns_lifecycle_consistent',
      sql`(${table.status} = 'deleted' and ${table.deletedAt} is not null and ${table.archivedAt} is not null) or (${table.status} = 'archived' and ${table.archivedAt} is not null and ${table.deletedAt} is null) or (${table.status} = 'active' and ${table.archivedAt} is null and ${table.deletedAt} is null)`,
    ),
  ],
);

export const campaignOperationReceipts = pgTable(
  'campaign_operation_receipts',
  {
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    operationKey: uuid('operation_key').notNull(),
    operation: text('operation').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    campaignId: uuid('campaign_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerUserId, table.operationKey] }),
    index('campaign_operation_receipts_campaign_idx').on(table.ownerUserId, table.campaignId),
    check(
      'campaign_operation_receipts_operation_supported',
      sql`${table.operation} = 'campaign-create'`,
    ),
    check(
      'campaign_operation_receipts_fingerprint_length',
      sql`length(${table.requestFingerprint}) = 64`,
    ),
  ],
);

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    campaignId: uuid('campaign_id'),
    title: text('title').notNull(),
    status: projectStatus('status').notNull().default('draft'),
    version: integer('version').notNull().default(1),
    currentRevisionId: uuid('current_revision_id'),
    currentRevisionNumber: integer('current_revision_number').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
    ...auditTimestamps,
  },
  (table) => [
    unique('projects_id_owner_unique').on(table.id, table.ownerUserId),
    index('projects_owner_status_recent_idx').on(
      table.ownerUserId,
      table.status,
      table.deletedAt,
      table.updatedAt,
    ),
    index('projects_owner_title_idx').on(table.ownerUserId, table.title),
    index('projects_owner_lifecycle_idx').on(table.ownerUserId, table.archivedAt, table.deletedAt),
    index('projects_owner_active_recent_idx')
      .on(table.ownerUserId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} is null and ${table.status} <> 'archived'`),
    index('projects_owner_archived_recent_idx')
      .on(table.ownerUserId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} is null and ${table.status} = 'archived'`),
    index('projects_owner_campaign_active_recent_idx')
      .on(table.ownerUserId, table.campaignId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} is null and ${table.status} <> 'archived'`),
    index('projects_owner_campaign_archived_recent_idx')
      .on(table.ownerUserId, table.campaignId, table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} is null and ${table.status} = 'archived'`),
    check('projects_version_positive', sql`${table.version} > 0`),
    check(
      'projects_current_revision_consistent',
      sql`(${table.currentRevisionId} is null and ${table.currentRevisionNumber} = 0) or (${table.currentRevisionId} is not null and ${table.currentRevisionNumber} > 0)`,
    ),
    check(
      'projects_lifecycle_consistent',
      sql`(${table.status} = 'deleted' and ${table.deletedAt} is not null and ${table.archivedAt} is not null) or (${table.status} = 'archived' and ${table.archivedAt} is not null and ${table.deletedAt} is null) or (${table.status} not in ('archived', 'deleted') and ${table.archivedAt} is null and ${table.deletedAt} is null)`,
    ),
    foreignKey({
      name: 'projects_campaign_same_owner_fk',
      columns: [table.campaignId, table.ownerUserId],
      foreignColumns: [campaignIdColumn(), campaignOwnerUserIdColumn()],
    }).onDelete('restrict'),
    foreignKey({
      name: 'projects_current_revision_same_project_fk',
      columns: [table.id, table.ownerUserId, table.currentRevisionId, table.currentRevisionNumber],
      foreignColumns: [
        projectRevisionProjectIdColumn(),
        projectRevisionOwnerUserIdColumn(),
        projectRevisionIdColumn(),
        projectRevisionNumberColumn(),
      ],
    }).onDelete('restrict'),
  ],
);

export const projectOperationReceipts = pgTable(
  'project_operation_receipts',
  {
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    operationKey: uuid('operation_key').notNull(),
    operation: text('operation').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    projectId: uuid('project_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerUserId, table.operationKey] }),
    index('project_operation_receipts_project_idx').on(table.ownerUserId, table.projectId),
    check('project_operation_receipts_operation_supported', sql`${table.operation} = 'create'`),
    check(
      'project_operation_receipts_fingerprint_length',
      sql`length(${table.requestFingerprint}) = 64`,
    ),
  ],
);

export const projectRevisions = pgTable(
  'project_revisions',
  {
    id: uuid('id').primaryKey(),
    projectId: uuid('project_id').notNull(),
    ownerUserId: uuid('owner_user_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    parentRevisionId: uuid('parent_revision_id'),
    parentRevisionNumber: integer('parent_revision_number'),
    snapshotSchemaVersion: integer('snapshot_schema_version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    authorKind: projectRevisionAuthorKind('author_kind').notNull(),
    authorId: text('author_id').notNull(),
    source: projectRevisionSource('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('project_revisions_project_number_unique').on(
      table.projectId,
      table.revisionNumber,
    ),
    unique('project_revisions_project_owner_id_number_unique').on(
      table.projectId,
      table.ownerUserId,
      table.id,
      table.revisionNumber,
    ),
    index('project_revisions_project_created_idx').on(table.projectId, table.createdAt),
    check('project_revisions_number_positive', sql`${table.revisionNumber} > 0`),
    check('project_revisions_snapshot_version_supported', sql`${table.snapshotSchemaVersion} = 1`),
    check(
      'project_revisions_parent_consistent',
      sql`(${table.revisionNumber} = 1 and ${table.parentRevisionId} is null and ${table.parentRevisionNumber} is null) or (${table.revisionNumber} > 1 and ${table.parentRevisionId} is not null and ${table.parentRevisionNumber} = ${table.revisionNumber} - 1)`,
    ),
    foreignKey({
      name: 'project_revisions_project_owner_fk',
      columns: [table.projectId, table.ownerUserId],
      foreignColumns: [projectIdColumn(), projectOwnerUserIdColumn()],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_revisions_parent_same_project_fk',
      columns: [
        table.projectId,
        table.ownerUserId,
        table.parentRevisionId,
        table.parentRevisionNumber,
      ],
      foreignColumns: [table.projectId, table.ownerUserId, table.id, table.revisionNumber],
    }).onDelete('restrict'),
  ],
);

export const projectAssets = pgTable(
  'project_assets',
  {
    projectId: uuid('project_id').notNull(),
    ownerUserId: uuid('owner_user_id').notNull(),
    assetId: uuid('asset_id').notNull(),
    role: projectAssetRole('role').notNull(),
    revisionId: uuid('revision_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.revisionId, table.assetId, table.role] }),
    index('project_assets_project_revision_idx').on(
      table.projectId,
      table.revisionNumber,
      table.assetId,
      table.role,
    ),
    index('project_assets_asset_idx').on(table.ownerUserId, table.assetId),
    foreignKey({
      name: 'project_assets_project_owner_fk',
      columns: [table.projectId, table.ownerUserId],
      foreignColumns: [projects.id, projects.ownerUserId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_assets_asset_owner_fk',
      columns: [table.assetId, table.ownerUserId],
      foreignColumns: [mediaAssets.id, mediaAssets.ownerUserId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_assets_revision_same_project_fk',
      columns: [table.projectId, table.ownerUserId, table.revisionId, table.revisionNumber],
      foreignColumns: [
        projectRevisions.projectId,
        projectRevisions.ownerUserId,
        projectRevisions.id,
        projectRevisions.revisionNumber,
      ],
    }).onDelete('restrict'),
  ],
);

export const projectVersionReferences = pgTable(
  'project_version_references',
  {
    projectId: uuid('project_id').notNull(),
    ownerUserId: uuid('owner_user_id').notNull(),
    savedVideoId: uuid('saved_video_id').notNull(),
    videoVersionId: uuid('video_version_id').notNull(),
    role: projectVersionReferenceRole('role').notNull(),
    revisionId: uuid('revision_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.projectId,
        table.revisionId,
        table.savedVideoId,
        table.videoVersionId,
        table.role,
      ],
    }),
    index('project_version_references_project_revision_idx').on(
      table.projectId,
      table.revisionNumber,
      table.videoVersionId,
      table.role,
    ),
    index('project_version_references_version_idx').on(
      table.ownerUserId,
      table.savedVideoId,
      table.videoVersionId,
    ),
    foreignKey({
      name: 'project_version_references_project_owner_fk',
      columns: [table.projectId, table.ownerUserId],
      foreignColumns: [projects.id, projects.ownerUserId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_version_references_video_owner_fk',
      columns: [table.savedVideoId, table.ownerUserId],
      foreignColumns: [savedVideos.id, savedVideos.ownerUserId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_version_references_version_same_video_fk',
      columns: [table.savedVideoId, table.ownerUserId, table.videoVersionId],
      foreignColumns: [videoVersions.videoId, videoVersions.ownerUserId, videoVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_version_references_revision_same_project_fk',
      columns: [table.projectId, table.ownerUserId, table.revisionId, table.revisionNumber],
      foreignColumns: [
        projectRevisions.projectId,
        projectRevisions.ownerUserId,
        projectRevisions.id,
        projectRevisions.revisionNumber,
      ],
    }).onDelete('restrict'),
  ],
);

export const projectJobs = pgTable(
  'project_jobs',
  {
    projectId: uuid('project_id').notNull(),
    ownerUserId: uuid('owner_user_id').notNull(),
    jobId: uuid('job_id').notNull(),
    initiatingRevisionId: uuid('initiating_revision_id').notNull(),
    initiatingRevisionNumber: integer('initiating_revision_number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.jobId] }),
    index('project_jobs_project_revision_idx').on(
      table.projectId,
      table.initiatingRevisionNumber,
      table.jobId,
    ),
    index('project_jobs_job_idx').on(table.ownerUserId, table.jobId),
    foreignKey({
      name: 'project_jobs_project_owner_fk',
      columns: [table.projectId, table.ownerUserId],
      foreignColumns: [projects.id, projects.ownerUserId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_jobs_job_owner_fk',
      columns: [table.jobId, table.ownerUserId],
      foreignColumns: [processingJobs.id, processingJobs.ownerUserId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_jobs_revision_same_project_fk',
      columns: [
        table.projectId,
        table.ownerUserId,
        table.initiatingRevisionId,
        table.initiatingRevisionNumber,
      ],
      foreignColumns: [
        projectRevisions.projectId,
        projectRevisions.ownerUserId,
        projectRevisions.id,
        projectRevisions.revisionNumber,
      ],
    }).onDelete('restrict'),
  ],
);

export const projectOutputs = pgTable(
  'project_outputs',
  {
    projectId: uuid('project_id').notNull(),
    ownerUserId: uuid('owner_user_id').notNull(),
    savedVideoId: uuid('saved_video_id').notNull(),
    videoVersionId: uuid('video_version_id').notNull(),
    producingRevisionId: uuid('producing_revision_id').notNull(),
    producingRevisionNumber: integer('producing_revision_number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.videoVersionId] }),
    index('project_outputs_project_revision_idx').on(
      table.projectId,
      table.producingRevisionNumber,
      table.videoVersionId,
    ),
    index('project_outputs_video_idx').on(
      table.ownerUserId,
      table.savedVideoId,
      table.videoVersionId,
    ),
    foreignKey({
      name: 'project_outputs_project_owner_fk',
      columns: [table.projectId, table.ownerUserId],
      foreignColumns: [projects.id, projects.ownerUserId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_outputs_video_owner_fk',
      columns: [table.savedVideoId, table.ownerUserId],
      foreignColumns: [savedVideos.id, savedVideos.ownerUserId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_outputs_version_same_video_fk',
      columns: [table.savedVideoId, table.ownerUserId, table.videoVersionId],
      foreignColumns: [videoVersions.videoId, videoVersions.ownerUserId, videoVersions.id],
    }).onDelete('restrict'),
    foreignKey({
      name: 'project_outputs_revision_same_project_fk',
      columns: [
        table.projectId,
        table.ownerUserId,
        table.producingRevisionId,
        table.producingRevisionNumber,
      ],
      foreignColumns: [
        projectRevisions.projectId,
        projectRevisions.ownerUserId,
        projectRevisions.id,
        projectRevisions.revisionNumber,
      ],
    }).onDelete('restrict'),
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
  directUploads,
  savedVoices,
  ownerMigrations,
  creativeAssets,
  creativeLibraries,
  referenceImageAssets,
  processingJobs,
  campaigns,
  campaignOperationReceipts,
  projects,
  projectOperationReceipts,
  projectRevisions,
  projectAssets,
  projectVersionReferences,
  projectJobs,
  projectOutputs,
  outbox,
  resourceReferences,
};
