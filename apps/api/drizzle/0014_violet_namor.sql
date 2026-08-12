CREATE TYPE "public"."campaign_status" AS ENUM('active', 'archived', 'deleted');--> statement-breakpoint
CREATE TABLE "campaign_operation_receipts" (
	"owner_user_id" uuid NOT NULL,
	"operation_key" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_operation_receipts_owner_user_id_operation_key_pk" PRIMARY KEY("owner_user_id","operation_key"),
	CONSTRAINT "campaign_operation_receipts_operation_supported" CHECK ("campaign_operation_receipts"."operation" = 'campaign-create'),
	CONSTRAINT "campaign_operation_receipts_fingerprint_length" CHECK (length("campaign_operation_receipts"."request_fingerprint") = 64)
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brief" text,
	"status" "campaign_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "campaigns_version_positive" CHECK ("campaigns"."version" > 0),
	CONSTRAINT "campaigns_name_length" CHECK (length(trim("campaigns"."name")) between 1 and 120),
	CONSTRAINT "campaigns_brief_length" CHECK ("campaigns"."brief" is null or length("campaigns"."brief") <= 1000),
	CONSTRAINT "campaigns_lifecycle_consistent" CHECK (("campaigns"."status" = 'deleted' and "campaigns"."deleted_at" is not null and "campaigns"."archived_at" is not null) or ("campaigns"."status" = 'archived' and "campaigns"."archived_at" is not null and "campaigns"."deleted_at" is null) or ("campaigns"."status" = 'active' and "campaigns"."archived_at" is null and "campaigns"."deleted_at" is null))
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "campaign_operation_receipts" ADD CONSTRAINT "campaign_operation_receipts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_operation_receipts_campaign_idx" ON "campaign_operation_receipts" USING btree ("owner_user_id","campaign_id");--> statement-breakpoint
CREATE INDEX "campaigns_owner_active_recent_idx" ON "campaigns" USING btree ("owner_user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "campaigns"."deleted_at" is null and "campaigns"."status" = 'active';--> statement-breakpoint
CREATE INDEX "campaigns_owner_archived_recent_idx" ON "campaigns" USING btree ("owner_user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "campaigns"."deleted_at" is null and "campaigns"."status" = 'archived';--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_campaign_same_owner_fk" FOREIGN KEY ("campaign_id","owner_user_id") REFERENCES "public"."campaigns"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;