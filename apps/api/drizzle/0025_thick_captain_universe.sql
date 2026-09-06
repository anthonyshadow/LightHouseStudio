CREATE TYPE "public"."ai_usage_outcome" AS ENUM('succeeded', 'failed', 'ambiguous', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "ai_usage_ledger" (
	"owner_user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"provider" text NOT NULL,
	"outcome" "ai_usage_outcome",
	"submitted_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ai_usage_ledger_owner_user_id_job_id_pk" PRIMARY KEY("owner_user_id","job_id"),
	CONSTRAINT "ai_usage_ledger_outcome_completed_consistent" CHECK (("ai_usage_ledger"."outcome" is null) = ("ai_usage_ledger"."completed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "ai_usage_ledger" ADD CONSTRAINT "ai_usage_ledger_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_ledger_owner_submitted_idx" ON "ai_usage_ledger" USING btree ("owner_user_id","submitted_at" DESC NULLS LAST,"job_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_ledger_open_idx" ON "ai_usage_ledger" USING btree ("submitted_at") WHERE "ai_usage_ledger"."outcome" is null;