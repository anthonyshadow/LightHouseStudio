CREATE TYPE "public"."project_source_kind" AS ENUM('uploaded', 'recorded', 'saved-video-version');--> statement-breakpoint
CREATE TABLE "project_sources" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"kind" "project_source_kind" NOT NULL,
	"saved_video_id" uuid,
	"video_version_id" uuid,
	"accepted_revision_id" uuid NOT NULL,
	"accepted_revision_number" integer NOT NULL,
	"operation_key" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"mime_type" text NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"container" text NOT NULL,
	"video_codec" text NOT NULL,
	"audio_codec" text,
	"duration_ms" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"has_audio" boolean NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_sources_lineage_consistent" CHECK (("project_sources"."kind" = 'saved-video-version' and "project_sources"."saved_video_id" is not null and "project_sources"."video_version_id" is not null) or ("project_sources"."kind" <> 'saved-video-version' and "project_sources"."saved_video_id" is null and "project_sources"."video_version_id" is null)),
	CONSTRAINT "project_sources_revision_positive" CHECK ("project_sources"."accepted_revision_number" > 0),
	CONSTRAINT "project_sources_size_positive" CHECK ("project_sources"."size_bytes" > 0),
	CONSTRAINT "project_sources_duration_positive" CHECK ("project_sources"."duration_ms" > 0),
	CONSTRAINT "project_sources_dimensions_positive" CHECK ("project_sources"."width" > 0 and "project_sources"."height" > 0),
	CONSTRAINT "project_sources_fingerprint_length" CHECK (length("project_sources"."request_fingerprint") = 64),
	CONSTRAINT "project_sources_media_supported" CHECK ("project_sources"."mime_type" in ('video/mp4', 'video/quicktime', 'video/webm') and "project_sources"."container" in ('mp4', 'quicktime', 'webm') and "project_sources"."video_codec" in ('avc', 'vp8'))
);
--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_owner_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_asset_owner_fk" FOREIGN KEY ("asset_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_revision_same_project_fk" FOREIGN KEY ("project_id","owner_user_id","accepted_revision_id","accepted_revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_saved_video_owner_fk" FOREIGN KEY ("saved_video_id","owner_user_id") REFERENCES "public"."saved_videos"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_version_same_video_fk" FOREIGN KEY ("saved_video_id","owner_user_id","video_version_id") REFERENCES "public"."video_versions"("video_id","owner_user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_sources_owner_operation_unique" ON "project_sources" USING btree ("owner_user_id","operation_key");--> statement-breakpoint
CREATE INDEX "project_sources_asset_idx" ON "project_sources" USING btree ("owner_user_id","asset_id");