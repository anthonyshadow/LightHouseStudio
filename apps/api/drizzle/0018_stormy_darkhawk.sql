CREATE TABLE "project_working_media_adoptions" (
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"saved_video_id" uuid,
	"video_version_id" uuid,
	"adopted_revision_id" uuid NOT NULL,
	"adopted_revision_number" integer NOT NULL,
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
	"adopted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_working_media_adoptions_project_id_adopted_revision_id_pk" PRIMARY KEY("project_id","adopted_revision_id"),
	CONSTRAINT "project_working_media_lineage_consistent" CHECK (("project_working_media_adoptions"."kind" = 'saved-video-version' and "project_working_media_adoptions"."saved_video_id" is not null and "project_working_media_adoptions"."video_version_id" is not null) or ("project_working_media_adoptions"."kind" <> 'saved-video-version' and "project_working_media_adoptions"."saved_video_id" is null and "project_working_media_adoptions"."video_version_id" is null)),
	CONSTRAINT "project_working_media_kind_supported" CHECK ("project_working_media_adoptions"."kind" in ('local-render', 'media-asset', 'saved-video-version')),
	CONSTRAINT "project_working_media_revision_positive" CHECK ("project_working_media_adoptions"."adopted_revision_number" > 0),
	CONSTRAINT "project_working_media_size_positive" CHECK ("project_working_media_adoptions"."size_bytes" > 0),
	CONSTRAINT "project_working_media_duration_positive" CHECK ("project_working_media_adoptions"."duration_ms" > 0),
	CONSTRAINT "project_working_media_dimensions_positive" CHECK ("project_working_media_adoptions"."width" > 0 and "project_working_media_adoptions"."height" > 0),
	CONSTRAINT "project_working_media_fingerprint_length" CHECK (length("project_working_media_adoptions"."request_fingerprint") = 64),
	CONSTRAINT "project_working_media_media_supported" CHECK ("project_working_media_adoptions"."mime_type" in ('video/mp4', 'video/quicktime', 'video/webm') and "project_working_media_adoptions"."container" in ('mp4', 'quicktime', 'webm') and "project_working_media_adoptions"."video_codec" in ('avc', 'vp8'))
);
--> statement-breakpoint
ALTER TABLE "project_revisions" DROP CONSTRAINT "project_revisions_snapshot_version_supported";--> statement-breakpoint
ALTER TABLE "project_working_media_adoptions" ADD CONSTRAINT "project_working_media_project_owner_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_working_media_adoptions" ADD CONSTRAINT "project_working_media_asset_owner_fk" FOREIGN KEY ("asset_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_working_media_adoptions" ADD CONSTRAINT "project_working_media_revision_same_project_fk" FOREIGN KEY ("project_id","owner_user_id","adopted_revision_id","adopted_revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_working_media_adoptions" ADD CONSTRAINT "project_working_media_saved_video_owner_fk" FOREIGN KEY ("saved_video_id","owner_user_id") REFERENCES "public"."saved_videos"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_working_media_adoptions" ADD CONSTRAINT "project_working_media_version_same_video_fk" FOREIGN KEY ("saved_video_id","owner_user_id","video_version_id") REFERENCES "public"."video_versions"("video_id","owner_user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_working_media_owner_operation_unique" ON "project_working_media_adoptions" USING btree ("owner_user_id","operation_key");--> statement-breakpoint
CREATE INDEX "project_working_media_asset_idx" ON "project_working_media_adoptions" USING btree ("owner_user_id","asset_id");--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_snapshot_version_supported" CHECK ("project_revisions"."snapshot_schema_version" in (1, 2));