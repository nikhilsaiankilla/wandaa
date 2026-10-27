CREATE TYPE "public"."application_status" AS ENUM('saved', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'achieved', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."inbox_kind" AS ENUM('idea', 'link', 'note');--> statement-breakpoint
CREATE TYPE "public"."job_run_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'normal', 'high');--> statement-breakpoint
ALTER TYPE "public"."draft_status" ADD VALUE 'posted';--> statement-breakpoint
ALTER TYPE "public"."draft_status" ADD VALUE 'failed';--> statement-breakpoint
CREATE TABLE "goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"unit" text,
	"target_value" numeric(16, 2),
	"current_value" numeric(16, 2) DEFAULT '0' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"status" "goal_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "inbox_kind" DEFAULT 'note' NOT NULL,
	"content" text NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"cursor" text,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"alerted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_state_source_unique" UNIQUE("source")
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"status" "application_status" DEFAULT 'applied' NOT NULL,
	"applied_on" date,
	"follow_up_on" date,
	"url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"run_key" text NOT NULL,
	"status" "job_run_status" DEFAULT 'running' NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "job_runs_job_run_key" UNIQUE("job","run_key")
);
--> statement-breakpoint
CREATE TABLE "processed_updates" (
	"update_id" bigint PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_reviews" (
	"week_start" date PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"stats" jsonb,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "source_day" date;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "target_per_week" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD COLUMN "product" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" "task_priority" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "project" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "goal_id" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "goals_status_ends_idx" ON "goals" USING btree ("status","ends_on");--> statement-breakpoint
CREATE INDEX "inbox_items_processed_idx" ON "inbox_items" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "job_applications_status_followup_idx" ON "job_applications" USING btree ("status","follow_up_on");--> statement-breakpoint
CREATE INDEX "job_runs_started_idx" ON "job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "reminders_status_remind_idx" ON "reminders" USING btree ("status","remind_at");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drafts_status_created_idx" ON "drafts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "habit_entries_day_idx" ON "habit_entries" USING btree ("day");--> statement-breakpoint
CREATE INDEX "metric_snapshots_product_idx" ON "metric_snapshots" USING btree ("product","captured_at");--> statement-breakpoint
CREATE INDEX "tasks_status_due_idx" ON "tasks" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "tasks_completed_at_idx" ON "tasks" USING btree ("completed_at");--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_sleep_range" CHECK ("daily_logs"."sleep_hours" between 0 and 24);--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_energy_range" CHECK ("daily_logs"."energy" between 1 and 5);--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_target_range" CHECK ("habits"."target_per_week" between 1 and 7);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_text_length" CHECK (char_length("tasks"."text") between 1 and 500);