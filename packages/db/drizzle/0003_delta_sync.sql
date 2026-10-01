ALTER TABLE "messages" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "food_items_updated_idx" ON "food_items" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "messages_channel_updated_idx" ON "messages" USING btree ("channel_id","updated_at");--> statement-breakpoint
-- Delta sync (browser caches revalidate with "what changed since T"): updated_at must move on every change, so
-- triggers own it instead of application code. Existing messages get their best-known change time.
UPDATE "messages" SET "updated_at" = greatest("created_at", coalesce("edited_at", "created_at"), coalesce("deleted_at", "created_at"));--> statement-breakpoint
CREATE OR REPLACE FUNCTION ch_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS messages_touch_updated_at ON "messages";--> statement-breakpoint
CREATE TRIGGER messages_touch_updated_at BEFORE UPDATE ON "messages" FOR EACH ROW EXECUTE FUNCTION ch_touch_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS food_items_touch_updated_at ON "food_items";--> statement-breakpoint
CREATE TRIGGER food_items_touch_updated_at BEFORE UPDATE ON "food_items" FOR EACH ROW EXECUTE FUNCTION ch_touch_updated_at();--> statement-breakpoint
-- A reaction added or removed changes how the message renders, so it counts as a change to the message.
CREATE OR REPLACE FUNCTION ch_touch_message_on_reaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "messages" SET "updated_at" = now() WHERE "id" = coalesce(NEW."message_id", OLD."message_id");
  RETURN NULL;
END
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS reactions_touch_message ON "reactions";--> statement-breakpoint
CREATE TRIGGER reactions_touch_message AFTER INSERT OR UPDATE OR DELETE ON "reactions" FOR EACH ROW EXECUTE FUNCTION ch_touch_message_on_reaction();
