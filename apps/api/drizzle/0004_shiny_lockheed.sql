ALTER TYPE "public"."creative_asset_kind" ADD VALUE 'recent-prompt' BEFORE 'character';--> statement-breakpoint
CREATE TABLE "creative_libraries" (
	"owner_user_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_assets" DROP CONSTRAINT "creative_assets_pkey";--> statement-breakpoint
ALTER TABLE "creative_assets" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_owner_user_id_kind_id_pk" PRIMARY KEY("owner_user_id","kind","id");--> statement-breakpoint
ALTER TABLE "creative_libraries" ADD CONSTRAINT "creative_libraries_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
