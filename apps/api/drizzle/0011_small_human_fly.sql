DROP INDEX "project_assets_project_role_idx";--> statement-breakpoint
DROP INDEX "project_jobs_project_idx";--> statement-breakpoint
DROP INDEX "project_outputs_project_idx";--> statement-breakpoint
DROP INDEX "project_version_references_project_revision_idx";--> statement-breakpoint
CREATE INDEX "project_assets_project_revision_idx" ON "project_assets" USING btree ("project_id","revision_number","asset_id","role");--> statement-breakpoint
CREATE INDEX "project_jobs_project_revision_idx" ON "project_jobs" USING btree ("project_id","initiating_revision_number","job_id");--> statement-breakpoint
CREATE INDEX "project_outputs_project_revision_idx" ON "project_outputs" USING btree ("project_id","producing_revision_number","video_version_id");--> statement-breakpoint
CREATE INDEX "video_versions_asset_idx" ON "video_versions" USING btree ("owner_user_id","asset_id");--> statement-breakpoint
CREATE INDEX "video_versions_thumbnail_asset_idx" ON "video_versions" USING btree ("owner_user_id","thumbnail_asset_id");--> statement-breakpoint
CREATE INDEX "project_version_references_project_revision_idx" ON "project_version_references" USING btree ("project_id","revision_number","video_version_id","role");