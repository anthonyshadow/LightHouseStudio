CREATE TYPE "public"."direct_upload_status" AS ENUM('pending', 'uploading', 'verifying', 'ready', 'failed', 'aborted', 'expired');--> statement-breakpoint
CREATE TABLE "direct_uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"provider_upload_id" text,
	"status" "direct_upload_status" DEFAULT 'pending' NOT NULL,
	"expected_mime_type" text NOT NULL,
	"expected_size_bytes" bigint NOT NULL,
	"filename" text NOT NULL,
	"request" jsonb NOT NULL,
	"result_video_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_uploads_asset_id_unique" UNIQUE("asset_id"),
	CONSTRAINT "direct_uploads_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "direct_uploads_size_positive" CHECK ("direct_uploads"."expected_size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "direct_uploads" ADD CONSTRAINT "direct_uploads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_uploads" ADD CONSTRAINT "direct_uploads_result_video_id_saved_videos_id_fk" FOREIGN KEY ("result_video_id") REFERENCES "public"."saved_videos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "direct_uploads_owner_idempotency_unique" ON "direct_uploads" USING btree ("owner_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "direct_uploads_expiry_idx" ON "direct_uploads" USING btree ("status","expires_at");