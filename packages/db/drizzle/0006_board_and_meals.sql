CREATE TABLE "board_week_results" (
	"team_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"ranked_count" smallint NOT NULL,
	"awards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"message_id" uuid,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_week_results_team_id_week_start_pk" PRIMARY KEY("team_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "board_weeks" (
	"team_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"user_id" uuid NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"parts" jsonb NOT NULL,
	"days" jsonb NOT NULL,
	"status" text DEFAULT 'ranked' NOT NULL,
	"workouts" smallint DEFAULT 0 NOT NULL,
	"solid_days" smallint DEFAULT 0 NOT NULL,
	"protein_days" smallint DEFAULT 0 NOT NULL,
	"full_days" smallint DEFAULT 0 NOT NULL,
	"away_days" smallint DEFAULT 0 NOT NULL,
	"plan_done" boolean DEFAULT false NOT NULL,
	"has_plan" boolean DEFAULT false NOT NULL,
	"dawn_rank" smallint,
	"prev_dawn_rank" smallint,
	"final_rank" smallint,
	"final" boolean DEFAULT false NOT NULL,
	"rules_version" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_weeks_team_id_week_start_user_id_pk" PRIMARY KEY("team_id","week_start","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_board_state" (
	"team_id" uuid PRIMARY KEY NOT NULL,
	"crown_user_id" uuid,
	"crown_since" date,
	"dawn_for" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "day_facts" ADD COLUMN "meals_on_time" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "day_facts" ADD COLUMN "snap_only" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "day_facts" ADD COLUMN "kcal_class" text;--> statement-breakpoint
ALTER TABLE "day_facts" ADD COLUMN "protein_class" text;--> statement-breakpoint
ALTER TABLE "day_facts" ADD COLUMN "workouts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "day_facts" ADD COLUMN "weighed_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "day_facts" ADD COLUMN "points" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "day_facts" ADD COLUMN "solid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "day_facts" ADD COLUMN "settled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "pending_details" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "board_weeks" ADD CONSTRAINT "board_weeks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_weeks_user_idx" ON "board_weeks" USING btree ("user_id","week_start");--> statement-breakpoint
-- Existing teams get the leaderboard defaults (new teams get them from DEFAULT_TEAM_SETTINGS). Data only: the code
-- also fills missing settings on read, so this is safe to run before or after the deploy.
UPDATE "teams" SET "settings" = jsonb_set("settings", '{featureFlags,leaderboard}', 'true'::jsonb, true) WHERE NOT ("settings"->'featureFlags' ? 'leaderboard');
--> statement-breakpoint
UPDATE "teams" SET "settings" = "settings" || jsonb_build_object('board', '{"workoutMinMinutes":20,"workoutCap":4,"noPlanTarget":3,"postResults":true,"showOnDashboard":true}'::jsonb) WHERE "settings"->'board' IS NULL;
--> statement-breakpoint
-- Notification defaults are an exhaustive record: add the new weekly-results type (and habit reminders, for teams
-- created before habits) so the next admin save validates.
UPDATE "teams" SET "settings" = jsonb_set("settings", '{notificationDefaults,board_results}', '{"enabled":true,"time":null,"days":[0,1,2,3,4,5,6],"smartTime":false}'::jsonb, true) WHERE NOT ("settings"->'notificationDefaults' ? 'board_results');
--> statement-breakpoint
UPDATE "teams" SET "settings" = jsonb_set("settings", '{notificationDefaults,habit_reminder}', '{"enabled":true,"time":null,"days":[0,1,2,3,4,5,6],"smartTime":false}'::jsonb, true) WHERE NOT ("settings"->'notificationDefaults' ? 'habit_reminder');
--> statement-breakpoint
-- Everyone starts on the leaderboard (Settings › Privacy turns it off).
UPDATE "profiles" SET "privacy" = "privacy" || '{"showOnBoard":true}'::jsonb WHERE NOT ("privacy" ? 'showOnBoard');
