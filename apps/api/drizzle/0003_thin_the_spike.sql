ALTER TABLE "processing_jobs" ADD COLUMN "output_resolution" text;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD COLUMN "provider_output_location" text;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD COLUMN "source_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "processing_jobs" ADD COLUMN "source_orientation" text;