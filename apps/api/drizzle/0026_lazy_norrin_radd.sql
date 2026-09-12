CREATE TABLE "reference_image_submissions" (
	"owner_user_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"request_fingerprint" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_image_submissions_owner_user_id_request_id_pk" PRIMARY KEY("owner_user_id","request_id"),
	CONSTRAINT "reference_image_submissions_fingerprint_length" CHECK (length("reference_image_submissions"."request_fingerprint") = 64)
);
--> statement-breakpoint
ALTER TABLE "reference_image_submissions" ADD CONSTRAINT "reference_image_submissions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;