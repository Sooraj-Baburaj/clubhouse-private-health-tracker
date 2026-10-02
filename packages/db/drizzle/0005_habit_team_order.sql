-- Habits now follow one team order (sort_order) instead of being grouped by section first. Renumber each team's
-- habits in the order members saw them until now (Morning, Home, Self-care, Evening; then sort_order, name), so nothing
-- moves on screen. Data only: safe to run before or after the code that uses it.
UPDATE "habits" h
SET "sort_order" = r.rn
FROM (
  SELECT "id", (row_number() OVER (
    PARTITION BY "team_id"
    ORDER BY CASE "group_name" WHEN 'Morning' THEN 0 WHEN 'Home' THEN 1 WHEN 'Self-care' THEN 2 WHEN 'Evening' THEN 3 ELSE 9 END, "sort_order", "name"
  ) - 1)::int AS rn
  FROM "habits"
) r
WHERE h."id" = r."id";
