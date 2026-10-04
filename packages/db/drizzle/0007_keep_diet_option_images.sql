-- Diet option photos were uploaded as kind 'food', so they inherited the member-photo retention window and would be
-- purged. Re-tag them as 'diet' and clear the expiry; new uploads use kind 'diet' directly. Data only.
UPDATE "images"
SET "kind" = 'diet', "expires_at" = NULL
WHERE "purged_at" IS NULL
  AND "id" IN (SELECT "image_id" FROM "diet_meal_options" WHERE "image_id" IS NOT NULL);
