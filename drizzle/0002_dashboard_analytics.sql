ALTER TABLE "processed_updates" ADD COLUMN "event_type" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "processed_updates" ADD COLUMN "user_handle" text;--> statement-breakpoint
ALTER TABLE "processed_updates" ADD COLUMN "action_preview" text;--> statement-breakpoint
ALTER TABLE "processed_updates" ADD COLUMN "status" text DEFAULT 'received' NOT NULL;--> statement-breakpoint
CREATE INDEX "processed_updates_received_at_idx" ON "processed_updates" USING btree ("received_at");
