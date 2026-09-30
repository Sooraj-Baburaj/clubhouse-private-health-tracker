CREATE TYPE "public"."user_role" AS ENUM('member', 'admin', 'super_admin');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"date" date NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"type_id" uuid NOT NULL,
	"duration_min" real NOT NULL,
	"distance_km" real,
	"intensity" text,
	"focus" text,
	"kcal_burned" real NOT NULL,
	"kcal_overridden" boolean DEFAULT false NOT NULL,
	"met" real,
	"plan_item_id" uuid,
	"image_id" uuid,
	"note" text,
	"added_late" boolean DEFAULT false NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity_plan_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"per_week" integer,
	"per_month" integer,
	"target_min" integer,
	"note" text,
	"suggested_days" integer[],
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_plan_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_reply" text,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_plans_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "activity_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'activity' NOT NULL,
	"met" real NOT NULL,
	"met_bands" jsonb,
	"inputs" text[] NOT NULL,
	"default_duration_min" integer DEFAULT 30 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_login_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_hash" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"new_device" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_budgets" (
	"team_id" uuid NOT NULL,
	"month" text NOT NULL,
	"cap_usd" numeric(10, 2) NOT NULL,
	"spent_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"alerts_sent" integer[] DEFAULT '{}'::int[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_budgets_team_id_month_pk" PRIMARY KEY("team_id","month")
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"requested_model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"latency_ms" integer,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"image_count" smallint DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"error_category" text,
	"error_message" text,
	"request_id" text,
	"test" boolean DEFAULT false NOT NULL,
	"prompt_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "ai_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text NOT NULL,
	"effective_from" date NOT NULL,
	"input_per_mtok" double precision NOT NULL,
	"output_per_mtok" double precision NOT NULL,
	"cache_read_per_mtok" double precision NOT NULL,
	"cache_write_per_mtok" double precision NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_settings" (
	"team_id" uuid PRIMARY KEY NOT NULL,
	"global_on" boolean DEFAULT false NOT NULL,
	"features" jsonb NOT NULL,
	"budget" jsonb NOT NULL,
	"prompt_retention_days" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_summaries" (
	"user_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"local_date" date NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb NOT NULL,
	"ai_call_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_summaries_user_id_feature_local_date_pk" PRIMARY KEY("user_id","feature","local_date")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"pinned" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"message_id" uuid,
	"stats" jsonb DEFAULT '{"recipients":0,"pushed":0,"failed":0,"opened":0}'::jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" uuid,
	"actor_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"member_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"high_impact" boolean DEFAULT false NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'team' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_mutes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"muted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reads" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"last_read_seq" bigint DEFAULT 0 NOT NULL,
	"on_chat_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_facts" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"logged" boolean NOT NULL,
	"food_logged" boolean NOT NULL,
	"activity_logged" boolean NOT NULL,
	"in_range" boolean NOT NULL,
	"kcal_eaten" real DEFAULT 0 NOT NULL,
	"kcal_burned" real DEFAULT 0 NOT NULL,
	"kcal_target" integer,
	"totals" jsonb,
	"targets" jsonb,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_facts_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"note" text,
	"status" text DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "diet_feedback" (
	"user_id" uuid NOT NULL,
	"option_name" text NOT NULL,
	"option_id" uuid,
	"reaction" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diet_feedback_user_id_option_name_pk" PRIMARY KEY("user_id","option_name")
);
--> statement-breakpoint
CREATE TABLE "diet_meal_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"meal_slot" text NOT NULL,
	"day_type" text DEFAULT 'any' NOT NULL,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"nutrition" jsonb NOT NULL,
	"prep_note" text,
	"image_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"ai_estimate_items" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diet_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"note" text,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"ai_call_id" uuid,
	"review_checklist" jsonb,
	"reviewed_by" uuid,
	"created_by" uuid,
	"published_by" uuid,
	"published_at" timestamp with time zone,
	"effective_from" date,
	"previous_version_id" uuid,
	"target_kcal" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"scope" text NOT NULL,
	"storage_key" text,
	"bytes" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "food_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid,
	"owner_id" uuid,
	"name" text NOT NULL,
	"brand" text,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_text" text NOT NULL,
	"per_100g" jsonb NOT NULL,
	"serving_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_serving" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"category" text,
	"veg" boolean,
	"source" text NOT NULL,
	"external_id" text,
	"verified" boolean DEFAULT false NOT NULL,
	"admin_edited" boolean DEFAULT false NOT NULL,
	"confidence" real,
	"merged_into_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "food_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal_slot" text NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"items" jsonb NOT NULL,
	"totals" jsonb NOT NULL,
	"image_id" uuid,
	"ai_call_id" uuid,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"confidence" real,
	"note" text,
	"added_late" boolean DEFAULT false NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "food_usage" (
	"user_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"favourite" boolean DEFAULT false NOT NULL,
	"last_grams" real,
	"last_serving_label" text,
	CONSTRAINT "food_usage_user_id_food_id_pk" PRIMARY KEY("user_id","food_id")
);
--> statement-breakpoint
CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"owner_id" uuid,
	"client_id" uuid,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"thumb_bytes" integer DEFAULT 0 NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" text,
	"expires_at" timestamp with time zone,
	"purge_requested_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_locks" (
	"name" text PRIMARY KEY NOT NULL,
	"locked_until" timestamp with time zone,
	"owner" text,
	"acquired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "job_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meme_fires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"trigger_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"meme_id" uuid,
	"message_id" uuid,
	"notification_id" uuid,
	"action" text NOT NULL,
	"cooldown_key" text NOT NULL,
	"event_key" text NOT NULL,
	"local_date" date NOT NULL,
	"posted_to_chat" boolean DEFAULT false NOT NULL,
	"log_ref" jsonb,
	"test" boolean DEFAULT false NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"reactions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meme_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"catalog_key" text,
	"name" text NOT NULL,
	"event" text NOT NULL,
	"match" text DEFAULT 'all' NOT NULL,
	"conditions" jsonb NOT NULL,
	"action" text NOT NULL,
	"selection" jsonb NOT NULL,
	"cooldown" text NOT NULL,
	"tone" text NOT NULL,
	"caption" text,
	"excluded_user_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"fired_count" integer DEFAULT 0 NOT NULL,
	"dismiss_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"image_id" uuid,
	"caption" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"tone" text DEFAULT 'neutral' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"suggested_by" uuid,
	"uses" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" uuid,
	"kind" text DEFAULT 'user' NOT NULL,
	"system_kind" text,
	"body" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reply_to_id" uuid,
	"mentions" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"meme_id" uuid,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"flagged_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"test" boolean DEFAULT false NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"client_created_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"enabled" boolean NOT NULL,
	"time" text,
	"days" smallint[] NOT NULL,
	"smart_time" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "notification_schedules" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"next_send_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"last_sent_local_date" date,
	"claimed_at" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_schedules_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	"push_result" text,
	"deliver_after" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"user_id" uuid NOT NULL,
	"record" text NOT NULL,
	"value" real NOT NULL,
	"unit" text NOT NULL,
	"achieved_on" date NOT NULL,
	"ref_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_records_user_id_record_pk" PRIMARY KEY("user_id","record")
);
--> statement-breakpoint
CREATE TABLE "presence" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"screen" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"units" text DEFAULT 'metric' NOT NULL,
	"height_cm" real,
	"weight_kg" real,
	"dob" date,
	"sex" text,
	"activity_level" text,
	"goal_type" text,
	"target_weight_kg" real,
	"target_date" date,
	"pace_kg_week" real,
	"calorie_target" integer,
	"protein_g" integer,
	"carbs_g" integer,
	"fat_g" integer,
	"fibre_g" integer,
	"tdee" integer,
	"targets_weight_kg" real,
	"targets_computed_at" timestamp with time zone,
	"target_overrides" jsonb,
	"targets_overridden_by" uuid,
	"override_reason" text,
	"eat_back_exercise" boolean DEFAULT false NOT NULL,
	"thresholds_override" jsonb,
	"diet_prefs" jsonb DEFAULT '{"allergies":[],"dislikes":[],"cuisines":[],"diet":"none"}'::jsonb NOT NULL,
	"privacy" jsonb NOT NULL,
	"ai_opt_outs" jsonb DEFAULT '{"photo":false,"summary":false,"noticeSeen":false}'::jsonb NOT NULL,
	"momentum_prefs" jsonb DEFAULT '{"showOnToday":["logging"]}'::jsonb NOT NULL,
	"app_prefs" jsonb DEFAULT '{"theme":"system","palette":"day"}'::jsonb NOT NULL,
	"quiet_hours" jsonb,
	"notifications_master" boolean DEFAULT true NOT NULL,
	"chat_muted_until" timestamp with time zone,
	"vacation_ranges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"smart_times" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"realtime_secret" text NOT NULL,
	"rolled_over_for" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"platform" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"fail_count" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"owner_id" uuid,
	"name" text NOT NULL,
	"items" jsonb NOT NULL,
	"servings" real DEFAULT 1 NOT NULL,
	"per_serving" jsonb NOT NULL,
	"promoted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rest_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"dry_run" boolean NOT NULL,
	"trigger" text NOT NULL,
	"images_deleted" integer DEFAULT 0 NOT NULL,
	"bytes_reclaimed" bigint DEFAULT 0 NOT NULL,
	"prompts_purged" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"started_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_label" text,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"mfa_verified_at" timestamp with time zone,
	"admin_last_active_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings_kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streak_states" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"best" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"grace_left" integer DEFAULT 0 NOT NULL,
	"paused_since" date,
	"last_counted_date" date,
	"at_risk" boolean DEFAULT false NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"computed_for" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streak_states_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "team_streaks" (
	"team_id" uuid PRIMARY KEY NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"best" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"computed_for" date,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"units" text DEFAULT 'metric' NOT NULL,
	"logo_image_id" uuid,
	"realtime_topic_secret" text NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"trigger_id" uuid NOT NULL,
	"user_id" uuid,
	"event" text NOT NULL,
	"event_key" text NOT NULL,
	"fired" boolean NOT NULL,
	"reasons" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"milestone" integer NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	CONSTRAINT "user_badges_user_id_kind_milestone_pk" PRIMARY KEY("user_id","kind","milestone")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"temp_password_expires_at" timestamp with time zone,
	"timezone" text,
	"avatar_image_id" uuid,
	"totp_secret_enc" "bytea",
	"totp_pending_secret_enc" "bytea",
	"totp_enabled_at" timestamp with time zone,
	"totp_recovery_hashes" text[],
	"onboarded_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"created_by" uuid,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_recaps" (
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"highlight" text NOT NULL,
	"try_next" text NOT NULL,
	"team_fact" text NOT NULL,
	"stats" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_recaps_user_id_week_start_pk" PRIMARY KEY("user_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "weight_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"date" date NOT NULL,
	"weight_kg" real NOT NULL,
	"note" text,
	"added_late" boolean DEFAULT false NOT NULL,
	"client_updated_at" timestamp with time zone NOT NULL,
	"server_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_type_id_activity_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_plan_days" ADD CONSTRAINT "activity_plan_days_item_id_activity_plan_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."activity_plan_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_plan_items" ADD CONSTRAINT "activity_plan_items_plan_id_activity_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."activity_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_plan_items" ADD CONSTRAINT "activity_plan_items_type_id_activity_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."activity_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_plan_proposals" ADD CONSTRAINT "activity_plan_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_plans" ADD CONSTRAINT "activity_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_login_events" ADD CONSTRAINT "admin_login_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_mutes" ADD CONSTRAINT "chat_mutes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD CONSTRAINT "chat_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_facts" ADD CONSTRAINT "day_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_feedback" ADD CONSTRAINT "diet_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_meal_options" ADD CONSTRAINT "diet_meal_options_plan_id_diet_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."diet_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_plans" ADD CONSTRAINT "diet_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_usage" ADD CONSTRAINT "food_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_usage" ADD CONSTRAINT "food_usage_food_id_food_items_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meme_fires" ADD CONSTRAINT "meme_fires_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reports" ADD CONSTRAINT "message_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_schedules" ADD CONSTRAINT "notification_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rest_weeks" ADD CONSTRAINT "rest_weeks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_states" ADD CONSTRAINT "streak_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_recaps" ADD CONSTRAINT "weekly_recaps_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_user_date_idx" ON "activity_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "activity_logs_user_sync_idx" ON "activity_logs" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_plan_days_uq" ON "activity_plan_days" USING btree ("item_id","weekday");--> statement-breakpoint
CREATE INDEX "admin_login_events_user_idx" ON "admin_login_events" USING btree ("user_id","device_hash");--> statement-breakpoint
CREATE INDEX "ai_calls_team_started_idx" ON "ai_calls" USING btree ("team_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_calls_user_feature_idx" ON "ai_calls" USING btree ("user_id","feature","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_pricing_model_from_uq" ON "ai_pricing" USING btree ("model","effective_from");--> statement-breakpoint
CREATE INDEX "audit_team_created_idx" ON "audit_logs" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_member_idx" ON "audit_logs" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "diet_options_plan_idx" ON "diet_meal_options" USING btree ("plan_id","meal_slot");--> statement-breakpoint
CREATE INDEX "diet_plans_user_idx" ON "diet_plans" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "diet_plans_one_published_uq" ON "diet_plans" USING btree ("user_id") WHERE "diet_plans"."status" = 'published' and "diet_plans"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "food_items_external_uq" ON "food_items" USING btree ("source","external_id") WHERE "food_items"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "food_items_team_idx" ON "food_items" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "food_items_owner_idx" ON "food_items" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "food_logs_user_date_idx" ON "food_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "food_logs_user_sync_idx" ON "food_logs" USING btree ("user_id","server_updated_at");--> statement-breakpoint
CREATE INDEX "food_logs_team_date_idx" ON "food_logs" USING btree ("team_id","date");--> statement-breakpoint
CREATE INDEX "food_usage_recent_idx" ON "food_usage" USING btree ("user_id","last_used_at");--> statement-breakpoint
CREATE UNIQUE INDEX "images_client_uq" ON "images" USING btree ("owner_id","client_id") WHERE "images"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "images_expiry_idx" ON "images" USING btree ("expires_at") WHERE "images"."purged_at" is null and "images"."expires_at" is not null;--> statement-breakpoint
CREATE INDEX "images_team_kind_idx" ON "images" USING btree ("team_id","kind");--> statement-breakpoint
CREATE INDEX "job_runs_job_started_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meme_fires_cooldown_uq" ON "meme_fires" USING btree ("trigger_id","cooldown_key") WHERE "meme_fires"."test" = false;--> statement-breakpoint
CREATE INDEX "meme_fires_user_idx" ON "meme_fires" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "meme_fires_team_date_idx" ON "meme_fires" USING btree ("team_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_seq_uq" ON "messages" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "messages_channel_seq_idx" ON "messages" USING btree ("channel_id","seq");--> statement-breakpoint
CREATE INDEX "messages_channel_created_idx" ON "messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "notification_schedules_due_idx" ON "notification_schedules" USING btree ("next_send_at") WHERE "notification_schedules"."next_send_at" is not null;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "notifications_deferred_idx" ON "notifications" USING btree ("deliver_after") WHERE "notifications"."deliver_after" is not null and "notifications"."pushed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "push_endpoint_uq" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recipes_owner_idx" ON "recipes" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rest_weeks_uq" ON "rest_weeks" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trigger_evaluations_trigger_idx" ON "trigger_evaluations" USING btree ("trigger_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uq" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree (lower("email")) WHERE "users"."email" is not null;--> statement-breakpoint
CREATE INDEX "users_team_idx" ON "users" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "weight_user_date_idx" ON "weight_entries" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "weight_user_sync_idx" ON "weight_entries" USING btree ("user_id","server_updated_at");