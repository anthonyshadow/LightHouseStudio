CREATE TYPE "public"."project_asset_role" AS ENUM('source', 'working', 'presented', 'reference', 'job-input', 'job-output', 'audio', 'thumbnail');--> statement-breakpoint
CREATE TYPE "public"."project_revision_author_kind" AS ENUM('user', 'system', 'migration');--> statement-breakpoint
CREATE TYPE "public"."project_revision_source" AS ENUM('create', 'user-edit', 'job-result', 'restore', 'migration');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'ready', 'processing', 'needs-attention', 'completed', 'archived', 'deleted');--> statement-breakpoint
CREATE TABLE "project_assets" (
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"role" "project_asset_role" NOT NULL,
	"revision_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_assets_project_id_asset_id_role_pk" PRIMARY KEY("project_id","asset_id","role")
);
--> statement-breakpoint
CREATE TABLE "project_jobs" (
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_jobs_project_id_job_id_pk" PRIMARY KEY("project_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "project_outputs" (
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"saved_video_id" uuid NOT NULL,
	"video_version_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_outputs_project_id_saved_video_id_video_version_id_pk" PRIMARY KEY("project_id","saved_video_id","video_version_id")
);
--> statement-breakpoint
CREATE TABLE "project_revisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"parent_revision_id" uuid,
	"parent_revision_number" integer,
	"snapshot_schema_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"author_kind" "project_revision_author_kind" NOT NULL,
	"author_id" text NOT NULL,
	"source" "project_revision_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_revisions_project_owner_id_number_unique" UNIQUE("project_id","owner_user_id","id","revision_number"),
	CONSTRAINT "project_revisions_number_positive" CHECK ("project_revisions"."revision_number" > 0),
	CONSTRAINT "project_revisions_snapshot_version_supported" CHECK ("project_revisions"."snapshot_schema_version" = 1),
	CONSTRAINT "project_revisions_parent_consistent" CHECK (("project_revisions"."revision_number" = 1 and "project_revisions"."parent_revision_id" is null and "project_revisions"."parent_revision_number" is null) or ("project_revisions"."revision_number" > 1 and "project_revisions"."parent_revision_id" is not null and "project_revisions"."parent_revision_number" = "project_revisions"."revision_number" - 1))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"current_revision_id" uuid,
	"current_revision_number" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "projects_version_positive" CHECK ("projects"."version" > 0),
	CONSTRAINT "projects_current_revision_consistent" CHECK (("projects"."current_revision_id" is null and "projects"."current_revision_number" = 0) or ("projects"."current_revision_id" is not null and "projects"."current_revision_number" > 0)),
	CONSTRAINT "projects_lifecycle_consistent" CHECK (("projects"."status" = 'deleted' and "projects"."deleted_at" is not null and "projects"."archived_at" is not null) or ("projects"."status" = 'archived' and "projects"."archived_at" is not null and "projects"."deleted_at" is null) or ("projects"."status" not in ('archived', 'deleted') and "projects"."archived_at" is null and "projects"."deleted_at" is null))
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_id_owner_unique" UNIQUE("id","owner_user_id");--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_id_owner_unique" UNIQUE("id","owner_user_id");--> statement-breakpoint
ALTER TABLE "saved_videos" ADD CONSTRAINT "saved_videos_id_owner_unique" UNIQUE("id","owner_user_id");--> statement-breakpoint
ALTER TABLE "video_versions" ADD CONSTRAINT "video_versions_video_owner_id_unique" UNIQUE("video_id","owner_user_id","id");--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_owner_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_asset_owner_fk" FOREIGN KEY ("asset_id","owner_user_id") REFERENCES "public"."media_assets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_revision_same_project_fk" FOREIGN KEY ("project_id","owner_user_id","revision_id","revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_jobs" ADD CONSTRAINT "project_jobs_project_owner_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_jobs" ADD CONSTRAINT "project_jobs_job_owner_fk" FOREIGN KEY ("job_id","owner_user_id") REFERENCES "public"."processing_jobs"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_jobs" ADD CONSTRAINT "project_jobs_revision_same_project_fk" FOREIGN KEY ("project_id","owner_user_id","revision_id","revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outputs" ADD CONSTRAINT "project_outputs_project_owner_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outputs" ADD CONSTRAINT "project_outputs_video_owner_fk" FOREIGN KEY ("saved_video_id","owner_user_id") REFERENCES "public"."saved_videos"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outputs" ADD CONSTRAINT "project_outputs_version_same_video_fk" FOREIGN KEY ("saved_video_id","owner_user_id","video_version_id") REFERENCES "public"."video_versions"("video_id","owner_user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outputs" ADD CONSTRAINT "project_outputs_revision_same_project_fk" FOREIGN KEY ("project_id","owner_user_id","revision_id","revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_project_owner_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_parent_same_project_fk" FOREIGN KEY ("project_id","owner_user_id","parent_revision_id","parent_revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_current_revision_same_project_fk" FOREIGN KEY ("id","owner_user_id","current_revision_id","current_revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_assets_project_role_idx" ON "project_assets" USING btree ("project_id","role","created_at");--> statement-breakpoint
CREATE INDEX "project_assets_asset_idx" ON "project_assets" USING btree ("owner_user_id","asset_id");--> statement-breakpoint
CREATE INDEX "project_jobs_project_idx" ON "project_jobs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_jobs_job_idx" ON "project_jobs" USING btree ("owner_user_id","job_id");--> statement-breakpoint
CREATE INDEX "project_outputs_project_idx" ON "project_outputs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_outputs_video_idx" ON "project_outputs" USING btree ("owner_user_id","saved_video_id","video_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_revisions_project_number_unique" ON "project_revisions" USING btree ("project_id","revision_number");--> statement-breakpoint
CREATE INDEX "project_revisions_project_created_idx" ON "project_revisions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "projects_owner_status_recent_idx" ON "projects" USING btree ("owner_user_id","status","deleted_at","updated_at");--> statement-breakpoint
CREATE INDEX "projects_owner_title_idx" ON "projects" USING btree ("owner_user_id","title");--> statement-breakpoint
CREATE INDEX "projects_owner_lifecycle_idx" ON "projects" USING btree ("owner_user_id","archived_at","deleted_at");
