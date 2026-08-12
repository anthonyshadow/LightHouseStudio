CREATE TABLE "project_operation_receipts" (
	"owner_user_id" uuid NOT NULL,
	"operation_key" uuid NOT NULL,
	"operation" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_operation_receipts_owner_user_id_operation_key_pk" PRIMARY KEY("owner_user_id","operation_key"),
	CONSTRAINT "project_operation_receipts_operation_supported" CHECK ("project_operation_receipts"."operation" = 'create'),
	CONSTRAINT "project_operation_receipts_fingerprint_length" CHECK (length("project_operation_receipts"."request_fingerprint") = 64)
);
--> statement-breakpoint
ALTER TABLE "project_operation_receipts" ADD CONSTRAINT "project_operation_receipts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_operation_receipts_project_idx" ON "project_operation_receipts" USING btree ("owner_user_id","project_id");