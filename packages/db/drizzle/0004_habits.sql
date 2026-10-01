CREATE TABLE "habit_assignments" (
	"habit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "habit_assignments_habit_id_user_id_pk" PRIMARY KEY("habit_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "habit_checkins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"date" date NOT NULL,
	"value" real NOT NULL,
	"done" boolean NOT NULL,
	"target" integer NOT NULL,
	"added_late" boolean DEFAULT false NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habit_member_prefs" (
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"reminder_time" text,
	"reminder_off" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_member_prefs_user_id_habit_id_pk" PRIMARY KEY("user_id","habit_id")
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text NOT NULL,
	"hue" smallint NOT NULL,
	"group_name" text NOT NULL,
	"kind" text NOT NULL,
	"target" integer DEFAULT 1 NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"schedule" jsonb NOT NULL,
	"assign_all" boolean DEFAULT true NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"reminder_time" text,
	"note" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"enabled" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "habit_prefs" jsonb DEFAULT '{"bundle":true,"share":false}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "habit_assignments" ADD CONSTRAINT "habit_assignments_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_assignments" ADD CONSTRAINT "habit_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_member_prefs" ADD CONSTRAINT "habit_member_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_member_prefs" ADD CONSTRAINT "habit_member_prefs_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_assignments_user_idx" ON "habit_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_checkins_uq" ON "habit_checkins" USING btree ("user_id","habit_id","date");--> statement-breakpoint
CREATE INDEX "habit_checkins_habit_date_idx" ON "habit_checkins" USING btree ("habit_id","date");--> statement-breakpoint
CREATE INDEX "habit_checkins_user_date_idx" ON "habit_checkins" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "habits_team_idx" ON "habits" USING btree ("team_id","archived_at");--> statement-breakpoint
-- Existing members get a schedule row for the new bundled habit reminder (new members get one at creation).
INSERT INTO "notification_schedules" ("user_id", "type", "next_send_at") SELECT "id", 'habit_reminder', NULL FROM "users" ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "notification_preferences" ("user_id", "type", "enabled", "time", "days", "smart_time") SELECT "id", 'habit_reminder', true, NULL, '{0,1,2,3,4,5,6}', false FROM "users" ON CONFLICT DO NOTHING;
