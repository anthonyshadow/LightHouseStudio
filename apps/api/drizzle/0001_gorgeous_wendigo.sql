ALTER TYPE "public"."operation_status" ADD VALUE 'validating' BEFORE 'submitting';--> statement-breakpoint
ALTER TYPE "public"."operation_status" ADD VALUE 'queued' BEFORE 'processing';--> statement-breakpoint
ALTER TYPE "public"."operation_status" ADD VALUE 'retrieving' BEFORE 'ready';