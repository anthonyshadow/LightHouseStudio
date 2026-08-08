CREATE TYPE "public"."asset_status" AS ENUM('pending', 'ready', 'missing', 'deleting', 'deleted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."asset_storage_provider" AS ENUM('local', 'r2');--> statement-breakpoint
CREATE TYPE "public"."creative_asset_kind" AS ENUM('saved-prompt', 'character', 'character-variant', 'outfit');--> statement-breakpoint
CREATE TYPE "public"."operation_status" AS ENUM('pending', 'submitting', 'accepted', 'ambiguous', 'processing', 'ready', 'failed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."saved_video_origin" AS ENUM('recorded', 'uploaded', 'character-swap', 'virtual-try-on', 'voice-treatment', 'editor', 'legacy-import');--> statement-breakpoint
CREATE TYPE "public"."saved_video_status" AS ENUM('ready', 'missing', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."user_plan" AS ENUM('free', 'plus', 'pro');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "creative_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" "creative_asset_kind" NOT NULL,
	"revision" integer NOT NULL,
	"schema_version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"storage_provider" "asset_storage_provider" NOT NULL,
	"storage_key" text NOT NULL,
	"status" "asset_status" DEFAULT 'pending' NOT NULL,
	"mime_type" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"etag" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_size_positive" CHECK ("media_assets"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_safe_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_migrations" (
	"owner_user_id" uuid NOT NULL,
	"migration_id" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_migrations_owner_user_id_migration_id_pk" PRIMARY KEY("owner_user_id","migration_id")
);
--> statement-breakpoint
CREATE TABLE "processing_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"provider" text NOT NULL,
	"provider_job_id" text,
	"request_fingerprint" text,
	"status" "operation_status" NOT NULL,
	"safe_error_code" text,
	"input_asset_id" uuid,
	"output_asset_id" uuid,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"attempt" integer DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_image_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_references" (
	"owner_user_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"target_asset_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_references_owner_user_id_source_type_source_id_target_asset_id_purpose_pk" PRIMARY KEY("owner_user_id","source_type","source_id","target_asset_id","purpose")
);
--> statement-breakpoint
CREATE TABLE "saved_video_receipts" (
	"owner_user_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_video_receipts_owner_user_id_idempotency_key_pk" PRIMARY KEY("owner_user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "saved_videos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"current_version_id" uuid NOT NULL,
	"source_video_id" uuid,
	"status" "saved_video_status" NOT NULL,
	"revision" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_voices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_voice_id" text NOT NULL,
	"public_owner_id" text,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"login" text NOT NULL,
	"normalized_login" text NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"plan_id" "user_plan" DEFAULT 'free' NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"password_hash" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"video_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"origin" "saved_video_origin" NOT NULL,
	"character_name" text,
	"source_version_id" uuid,
	"asset_id" uuid NOT NULL,
	"thumbnail_asset_id" uuid,
	"mime_type" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_ms" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_migrations" ADD CONSTRAINT "owner_migrations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_input_asset_id_media_assets_id_fk" FOREIGN KEY ("input_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_output_asset_id_media_assets_id_fk" FOREIGN KEY ("output_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_image_assets" ADD CONSTRAINT "reference_image_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_image_assets" ADD CONSTRAINT "reference_image_assets_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_references" ADD CONSTRAINT "resource_references_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_references" ADD CONSTRAINT "resource_references_target_asset_id_media_assets_id_fk" FOREIGN KEY ("target_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_video_receipts" ADD CONSTRAINT "saved_video_receipts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_video_receipts" ADD CONSTRAINT "saved_video_receipts_video_id_saved_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."saved_videos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_video_receipts" ADD CONSTRAINT "saved_video_receipts_version_id_video_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."video_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_videos" ADD CONSTRAINT "saved_videos_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_voices" ADD CONSTRAINT "saved_voices_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_video_id_saved_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."saved_videos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_thumbnail_asset_id_media_assets_id_fk" FOREIGN KEY ("thumbnail_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_assets_owner_kind_idx" ON "creative_assets" USING btree ("owner_user_id","kind","deleted_at","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_storage_key_unique" ON "media_assets" USING btree ("storage_provider","storage_key");--> statement-breakpoint
CREATE INDEX "media_assets_owner_status_idx" ON "media_assets" USING btree ("owner_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_owner_checksum_idx" ON "media_assets" USING btree ("owner_user_id","checksum_sha256");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_owner_status_idx" ON "processing_jobs" USING btree ("owner_user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "processing_jobs_lease_idx" ON "processing_jobs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "processing_jobs_owner_active_unique" ON "processing_jobs" USING btree ("owner_user_id") WHERE "processing_jobs"."status" in ('pending', 'submitting', 'accepted', 'processing');--> statement-breakpoint
CREATE UNIQUE INDEX "reference_images_owner_request_unique" ON "reference_image_assets" USING btree ("owner_user_id","request_id");--> statement-breakpoint
CREATE INDEX "resource_references_target_idx" ON "resource_references" USING btree ("owner_user_id","target_asset_id");--> statement-breakpoint
CREATE INDEX "saved_videos_gallery_idx" ON "saved_videos" USING btree ("owner_user_id","deleted_at","created_at","id");--> statement-breakpoint
CREATE INDEX "saved_videos_owner_status_idx" ON "saved_videos" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_voices_owner_provider_voice_unique" ON "saved_voices" USING btree ("owner_user_id","provider","provider_voice_id");--> statement-breakpoint
CREATE INDEX "sessions_user_expiry_idx" ON "sessions" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_login_unique" ON "users" USING btree ("normalized_login");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "video_versions_ordinal_unique" ON "video_versions" USING btree ("video_id","ordinal");--> statement-breakpoint
CREATE INDEX "video_versions_character_idx" ON "video_versions" USING btree ("owner_user_id","character_name");--> statement-breakpoint
CREATE INDEX "video_versions_duration_idx" ON "video_versions" USING btree ("owner_user_id","duration_ms","id");