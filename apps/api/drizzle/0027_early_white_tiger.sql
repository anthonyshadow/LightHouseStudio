ALTER TYPE "public"."project_asset_role" ADD VALUE 'clip';--> statement-breakpoint
ALTER TYPE "public"."project_version_reference_role" ADD VALUE 'clip';--> statement-breakpoint
ALTER TABLE "project_revisions" DROP CONSTRAINT "project_revisions_snapshot_version_supported";--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_snapshot_version_supported" CHECK ("project_revisions"."snapshot_schema_version" in (1, 2, 3));