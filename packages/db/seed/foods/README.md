# Food seed data

- `indian_curated.csv` — ~650 curated Indian foods (all regions; home, restaurant, street food, sweets, drinks). Source of truth: the Python rows in `../tools/build_indian.py`.
- `usda_generic.csv` — ~1,500 generic foods from USDA FoodData Central **SR Legacy** (April 2018 CSV release), selected and renamed by `../tools/build_usda.py`.

Columns: `external_id` (`in-<slug>` / `usda-<fdc_id>`, stable), `name`, `aliases` (pipe-separated search terms incl. Hindi/regional names), `category`, `tags` (pipe-separated, fixed vocabulary), `veg` (`true` = vegetarian incl. dairy; eggs/meat/fish = `false`), `kcal`, `protein`, `carbs` (total, incl. fibre), `fat`, `fibre`, `serving_options` (JSON `[{label, grams}]`, always incl. `100 g`), `default_serving` (a label from `serving_options`).

**All nutrient values are per 100 g of edible food as served.** Servings only convert household measures (katori, roti, glass, cup…) to grams.

Indian values are approximate recipe-based estimates for a typical home/restaurant preparation (guided by IFCT 2017, NIN "Nutritive Value of Indian Foods" and standard recipe calculations); kcal is derived from the macros (4/4/9 kcal per g protein/carbs/fat, 2 kcal per g fibre). Real dishes vary with oil, ghee and portion size — admins can edit and verify any value in the Admin panel. USDA values come straight from SR Legacy (energy nutrient 1008).

Rebuild (Python 3, stdlib only) from the repo root:

    python3 packages/db/seed/tools/build_indian.py
    python3 packages/db/seed/tools/build_usda.py      # downloads SR Legacy into tools/.cache/ on first run
    python3 packages/db/seed/tools/validate_foods.py  # header, ids, names, ranges, tags, servings, energy (±15 %)
