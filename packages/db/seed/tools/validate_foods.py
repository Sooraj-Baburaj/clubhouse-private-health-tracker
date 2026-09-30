#!/usr/bin/env python3
"""Validate the food seed CSVs (indian_curated.csv, usda_generic.csv).

Usage:  python3 packages/db/seed/tools/validate_foods.py [csv ...]

Checks: exact header, unique external_id (and id prefix), unique lower-cased name
within each file, allowed categories/tags, veg flag, numeric ranges (kcal 0-900,
macros >= 0, protein+carbs+fat <= 100, at most one decimal), serving_options JSON
(positive grams, unique labels, a "100 g" option), default_serving present in the
options, and energy consistency:

    est = 4*protein + 4*(carbs - fibre) + 2*fibre + 9*fat
    |kcal - est| must be <= 15 % of est (with an 8 kcal floor for very low-energy
    foods such as tea, lettuce or water, where rounding dominates).

Rows tagged `alcohol` are exempt from the energy check (ethanol supplies ~7 kcal/g,
which is not captured by the macro columns); they are listed in the report.
Exits with status 1 if any error is found.
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FOODS = os.path.join(HERE, "..", "foods")
DEFAULT_FILES = [os.path.join(FOODS, "indian_curated.csv"), os.path.join(FOODS, "usda_generic.csv")]

HEADER = ["external_id", "name", "aliases", "category", "tags", "veg", "kcal", "protein",
          "carbs", "fat", "fibre", "serving_options", "default_serving"]
CATEGORIES = {"breakfast", "main", "curry", "dal", "rice", "bread", "snack", "street_food", "sweet",
              "beverage", "fruit", "vegetable", "dairy", "egg", "meat", "seafood", "grain", "legume",
              "nut_seed", "fat_oil", "condiment", "salad", "soup", "other"}
TAGS = {"dessert", "fast_food", "alcohol", "fried", "sugary_drink", "high_protein", "high_fibre",
        "fruit", "vegetable", "dairy", "grain", "legume", "meat", "seafood", "egg", "snack",
        "beverage", "street_food"}
NUM_RE = re.compile(r"^\d+(\.\d)?$")
ID_RE = re.compile(r"^(in-[a-z0-9]+(?:-[a-z0-9]+)*|usda-\d+)$")


def energy_estimate(p, c, f, fib):
    return 4 * p + 4 * max(c - fib, 0) + 2 * fib + 9 * f


def validate(path):
    errors, warnings, exempt = [], [], []
    name = os.path.basename(path)
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.reader(fh)
        try:
            header = next(reader)
        except StopIteration:
            return [f"{name}: empty file"], [], [], 0
        if header != HEADER:
            errors.append(f"{name}: bad header {header}")
            return errors, warnings, exempt, 0
        ids, names = set(), set()
        n = 0
        for lineno, raw in enumerate(reader, start=2):
            n += 1
            where = f"{name}:{lineno}"
            if len(raw) != len(HEADER):
                errors.append(f"{where}: expected {len(HEADER)} columns, got {len(raw)}")
                continue
            r = dict(zip(HEADER, raw))
            tag = f"{where} [{r['name']}]"
            eid = r["external_id"]
            if not ID_RE.match(eid):
                errors.append(f"{tag}: bad external_id '{eid}'")
            if eid in ids:
                errors.append(f"{tag}: duplicate external_id '{eid}'")
            ids.add(eid)
            if not r["name"].strip():
                errors.append(f"{tag}: empty name")
            lname = r["name"].strip().lower()
            if lname in names:
                errors.append(f"{tag}: duplicate name")
            names.add(lname)
            if r["name"] != r["name"].strip() or r["name"][:1] != r["name"][:1].upper():
                errors.append(f"{tag}: name must be trimmed and start with a capital")
            if r["aliases"] and any(not a.strip() for a in r["aliases"].split("|")):
                errors.append(f"{tag}: empty alias in '{r['aliases']}'")
            if r["category"] not in CATEGORIES:
                errors.append(f"{tag}: bad category '{r['category']}'")
            tags = [t for t in r["tags"].split("|") if t] if r["tags"] else []
            bad = [t for t in tags if t not in TAGS]
            if bad:
                errors.append(f"{tag}: bad tags {bad}")
            if len(tags) != len(set(tags)):
                errors.append(f"{tag}: duplicate tags")
            if r["veg"] not in ("true", "false"):
                errors.append(f"{tag}: veg must be true/false")
            if r["category"] in ("meat", "seafood", "egg") and r["veg"] != "false":
                errors.append(f"{tag}: {r['category']} must be veg=false")

            vals = {}
            for k in ("kcal", "protein", "carbs", "fat", "fibre"):
                if not NUM_RE.match(r[k]):
                    errors.append(f"{tag}: {k} '{r[k]}' is not a non-negative number with <= 1 decimal")
                    vals = None
                    break
                vals[k] = float(r[k])
            if vals is not None:
                if not 0 <= vals["kcal"] <= 900:
                    errors.append(f"{tag}: kcal {vals['kcal']} out of range 0-900")
                if vals["protein"] + vals["carbs"] + vals["fat"] > 100.05:
                    errors.append(f"{tag}: protein+carbs+fat > 100 g")
                if vals["fibre"] > vals["carbs"] + 0.05:
                    warnings.append(f"{tag}: fibre {vals['fibre']} > carbs {vals['carbs']}")
                est = energy_estimate(vals["protein"], vals["carbs"], vals["fat"], vals["fibre"])
                if abs(vals["kcal"] - est) > max(0.15 * est, 8):
                    if "alcohol" in tags:
                        exempt.append(f"{tag}: kcal {vals['kcal']} vs macro estimate {est:.0f} (alcohol, exempt)")
                    else:
                        errors.append(f"{tag}: energy mismatch kcal {vals['kcal']} vs macro estimate {est:.0f}")

            try:
                opts = json.loads(r["serving_options"])
                if not isinstance(opts, list) or not opts:
                    raise ValueError("not a non-empty list")
                labels = []
                for o in opts:
                    if not isinstance(o, dict) or set(o) != {"label", "grams"}:
                        raise ValueError(f"bad option {o}")
                    if not isinstance(o["label"], str) or not o["label"].strip():
                        raise ValueError("empty label")
                    if not isinstance(o["grams"], (int, float)) or isinstance(o["grams"], bool) or o["grams"] <= 0:
                        raise ValueError(f"non-positive grams in {o}")
                    labels.append(o["label"])
                if len(labels) != len(set(labels)):
                    raise ValueError("duplicate labels")
                if not any(o["label"] == "100 g" and o["grams"] == 100 for o in opts):
                    raise ValueError("missing '100 g' option")
                if r["default_serving"] not in labels:
                    errors.append(f"{tag}: default_serving '{r['default_serving']}' not in serving_options")
            except (ValueError, json.JSONDecodeError) as e:
                errors.append(f"{tag}: serving_options invalid: {e}")
    return errors, warnings, exempt, n


def main(argv):
    files = argv[1:] or DEFAULT_FILES
    total_err = 0
    all_ids = {}
    for path in files:
        if not os.path.exists(path):
            print(f"MISSING {path}")
            total_err += 1
            continue
        errors, warnings, exempt, n = validate(path)
        with open(path, newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                if r["external_id"] in all_ids and all_ids[r["external_id"]] != path:
                    errors.append(f"{os.path.basename(path)}: external_id {r['external_id']} also in {os.path.basename(all_ids[r['external_id']])}")
                all_ids.setdefault(r["external_id"], path)
        status = "OK" if not errors else "FAIL"
        print(f"{status}  {os.path.basename(path)}: {n} rows, {len(errors)} errors, {len(warnings)} warnings, "
              f"{len(exempt)} alcohol rows exempt from energy check")
        for e in errors[:200]:
            print("  ERROR", e)
        if len(errors) > 200:
            print(f"  ... {len(errors) - 200} more errors")
        for w in warnings[:20]:
            print("  WARN ", w)
        if len(warnings) > 20:
            print(f"  ... {len(warnings) - 20} more warnings")
        for x in exempt:
            print("  NOTE ", x)
        total_err += len(errors)
    return 1 if total_err else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
