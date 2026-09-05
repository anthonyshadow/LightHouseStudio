CREATE TABLE "project_renditions" (
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"operation_key" uuid NOT NULL,
	"specification" jsonb NOT NULL,
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
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_renditions_owner_user_id_asset_id_pk" PRIMARY KEY("owner_user_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "project_renditions" ADD CONSTRAINT "project_renditions_project_owner_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_renditions" ADD CONSTRAINT "project_renditions_asset_owner_fk" FOREIGN KEY ("asset_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_renditions_owner_operation_unique" ON "project_renditions" USING btree ("owner_user_id","operation_key");