ALTER TYPE "public"."project_revision_source" ADD VALUE 'output-save' BEFORE 'restore';--> statement-breakpoint
CREATE TABLE "project_output_operation_receipts" (
	"owner_user_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"project_id" uuid NOT NULL,
	"saved_video_id" uuid NOT NULL,
	"video_version_id" uuid NOT NULL,
	"result_revision_id" uuid NOT NULL,
	"result_revision_number" integer NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_output_operation_receipts_owner_user_id_operation_id_pk" PRIMARY KEY("owner_user_id","operation_id"),
	CONSTRAINT "project_output_receipts_fingerprint_length" CHECK (length("project_output_operation_receipts"."request_fingerprint") = 64),
	CONSTRAINT "project_output_receipts_revision_positive" CHECK ("project_output_operation_receipts"."result_revision_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_output_operation_receipts" ADD CONSTRAINT "project_output_operation_receipts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_output_receipts_project_idx" ON "project_output_operation_receipts" USING btree ("owner_user_id","project_id","result_revision_number");