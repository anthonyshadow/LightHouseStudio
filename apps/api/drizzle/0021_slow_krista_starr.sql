CREATE TYPE "public"."project_asset_kind" AS ENUM('video', 'character', 'outfit', 'voice');--> statement-breakpoint
CREATE TABLE "project_asset_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"asset_kind" "project_asset_kind" NOT NULL,
	"resource_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_asset_memberships_owner_project_kind_resource_unique" UNIQUE("owner_user_id","project_id","asset_kind","resource_id"),
	CONSTRAINT "project_asset_memberships_resource_id_length" CHECK (length(trim("project_asset_memberships"."resource_id")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "project_asset_memberships" ADD CONSTRAINT "project_asset_memberships_project_owner_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_asset_memberships_project_kind_recent_idx" ON "project_asset_memberships" USING btree ("owner_user_id","project_id","asset_kind","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);