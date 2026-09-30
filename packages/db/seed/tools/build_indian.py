#!/usr/bin/env python3
"""Build packages/db/seed/foods/indian_curated.csv from the curated dataset below.

Usage:  python3 packages/db/seed/tools/build_indian.py

Every row is per 100 g of the food as served (edible portion). Values are
approximate estimates for a typical home / restaurant preparation, based on
IFCT 2017, NIN "Nutritive Value of Indian Foods" and standard recipe
calculations. Energy (kcal) is derived from the macros with the IFCT/Atwater
factors: 4 kcal/g protein, 4 kcal/g available carbohydrate (carbs - fibre),
2 kcal/g fibre, 9 kcal/g fat, so every row is energy-consistent by construction.

Row format:  R(name, category, veg, protein, carbs, fat, fibre, servings,
               default=None, aliases="", tags="")
  * carbs are total carbohydrate INCLUDING fibre
  * servings: list of (label, grams); "100 g" is appended automatically
  * default: label of the most common single portion (first serving if omitted)
  * tags: extra tags (fried, fast_food, sugary_drink, ...); category / keyword
    tags and high_protein / high_fibre are added automatically
Edit the rows and re-run the script to regenerate the CSV.
"""
from __future__ import annotations

import csv
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "foods", "indian_curated.csv")
HEADER = ["external_id", "name", "aliases", "category", "tags", "veg", "kcal", "protein",
          "carbs", "fat", "fibre", "serving_options", "default_serving"]
CATEGORIES = {"breakfast", "main", "curry", "dal", "rice", "bread", "snack", "street_food", "sweet",
              "beverage", "fruit", "vegetable", "dairy", "egg", "meat", "seafood", "grain", "legume",
              "nut_seed", "fat_oil", "condiment", "salad", "soup", "other"}
TAGS = {"dessert", "fast_food", "alcohol", "fried", "sugary_drink", "high_protein", "high_fibre",
        "fruit", "vegetable", "dairy", "grain", "legume", "meat", "seafood", "egg", "snack",
        "beverage", "street_food"}

V, NV = True, False  # vegetarian (incl. dairy) / contains meat, fish or egg

ROWS = []


def R(name, cat, veg, p, c, f, fib, sv, default=None, al="", tags=""):
    ROWS.append(dict(name=name, cat=cat, veg=veg, p=p, c=c, f=f, fib=fib, sv=sv,
                     default=default, al=al, tags=tags))


# ---- serving helpers (grams are edible portion as served) ------------------------------
def n(unit, g, plural=None, counts=(1, 2)):
    return [(f"{k} {unit if k == 1 else (plural or unit + 's')}", g * k) for k in counts]


def kat(g=150):  # katori = small steel bowl (~150 g for dal / sabzi / curry)
    return [("1 katori", g), ("1/2 katori", g / 2), ("1 bowl", round(g * 5 / 3))]


def rice(g=150):
    return [("1 katori", g), ("1 plate", g * 2)]


def plate(g):
    return [("1 plate", g)]


def bowl(g=250):
    return [("1 bowl", g)]


def cup(g=155):  # tea / coffee cup ~150 ml
    return [("1 cup", g)]


def glass(g=250):
    return [("1 glass", g)]


def tbsp(g=15):
    return [("1 tbsp", g)]


def tsp(g=5):
    return [("1 tsp", g)]


def pcs(g, unit="piece", plural=None):
    return n(unit, g, plural)


def handful(g=30):
    return [("1 handful", g)]


def ladle(g=90):
    return [("1 ladle", g)]


# =======================================================================================
# BREADS
# =======================================================================================
R("Roti", "bread", V, 8.7, 51, 3.7, 6.9, n("roti", 40), "2 rotis", "chapati|fulka|rotli|poli|chapathi")
R("Phulka", "bread", V, 8.8, 52, 1.5, 7, n("phulka", 30), "2 phulkas", "fulka|phulka roti|no-oil roti")
R("Chapati", "bread", V, 8.4, 49, 5.5, 6.5, n("chapati", 45), "2 chapatis", "chapathi|roti|rotli")
R("Roti with ghee", "bread", V, 8, 47, 9, 6.3, n("roti", 45), "2 rotis", "ghee roti|chupdi roti|tuppa chapati")
R("Tandoori roti", "bread", V, 9, 54, 2.5, 5, n("tandoori roti", 60), None, "tandoori rotti|tandoor roti")
R("Butter roti", "bread", V, 8.5, 50, 7.5, 4.6, n("butter roti", 65), None, "tandoori butter roti")
R("Missi roti", "bread", V, 11, 44, 7, 7.5, n("missi roti", 70), None, "besan roti")
R("Makki ki roti", "bread", V, 5.5, 45, 9, 6, n("makki ki roti", 70), None, "makki roti|corn roti|maize roti")
R("Bajra roti", "bread", V, 7.5, 48, 6, 8, n("bajra roti", 60), None, "bajre ki roti|sajje rotti|bajra bhakri|kambu roti")
R("Jowar roti", "bread", V, 7, 50, 3, 6.5, n("jowar roti", 55), None, "jolada rotti|jowar bhakri|jonna rotte")
R("Ragi roti", "bread", V, 5.5, 45, 6, 6, n("ragi roti", 60), None, "ragi rotti|nachni bhakri|finger millet roti")
R("Akki roti", "bread", V, 4.5, 42, 6, 2.5, n("akki roti", 80), None, "rice roti|rice flour roti")
R("Rumali roti", "bread", V, 8, 52, 4, 2.5, n("rumali roti", 50), None, "roomali roti")
R("Paratha", "bread", V, 7.5, 45, 13, 5.5, n("paratha", 80), None, "plain paratha|parantha|parotta (north)|tawa paratha")
R("Lachha paratha", "bread", V, 7, 46, 16, 4, n("lachha paratha", 90), None, "laccha paratha|lachcha paratha")
R("Aloo paratha", "bread", V, 5.8, 36, 10, 4, n("aloo paratha", 120), None, "alu paratha|potato paratha|aloo parantha")
R("Gobi paratha", "bread", V, 5.5, 32, 10, 4.5, n("gobi paratha", 120), None, "cauliflower paratha|gobhi paratha")
R("Methi paratha", "bread", V, 7.5, 40, 11, 6, n("methi paratha", 80), None, "fenugreek paratha")
R("Paneer paratha", "bread", V, 10, 33, 13, 3.5, n("paneer paratha", 120), None, "paneer parantha|cottage cheese paratha")
R("Mooli paratha", "bread", V, 5.5, 33, 9.5, 4.5, n("mooli paratha", 110), None, "radish paratha")
R("Egg paratha", "bread", NV, 9, 30, 13, 3.5, n("egg paratha", 130), None, "anda paratha|mughlai paratha")
R("Naan", "bread", V, 8.8, 50, 5, 2.2, n("naan", 90), None, "nan|plain naan|tandoori naan")
R("Butter naan", "bread", V, 8.5, 48, 9, 2.1, n("butter naan", 100), None, "makhani naan")
R("Garlic naan", "bread", V, 8.5, 48, 8.5, 2.2, n("garlic naan", 100), None, "lehsuni naan|garlic butter naan")
R("Cheese naan", "bread", V, 11, 42, 13, 1.8, n("cheese naan", 120), None, "cheese garlic naan")
R("Kulcha", "bread", V, 8.5, 50, 6, 2, n("kulcha", 80), None, "plain kulcha")
R("Amritsari kulcha", "bread", V, 6.5, 38, 12, 3, n("amritsari kulcha", 150), None, "stuffed kulcha|aloo kulcha")
R("Poori", "bread", V, 7, 44, 18, 4.5, n("poori", 30), "3 pooris", "puri|poori|luchi (whole wheat)", "fried")
R("Bhatura", "bread", V, 7, 47, 16, 2, n("bhatura", 80), None, "bhature|bhatoora", "fried")
R("Luchi", "bread", V, 6.5, 47, 19, 1.8, n("luchi", 25), "3 luchis", "maida puri", "fried")
R("Thepla", "bread", V, 7.5, 42, 11, 5.5, n("thepla", 40), "2 theplas", "methi thepla|thepala")
R("Bhakri", "bread", V, 8, 52, 8, 7, n("bhakri", 70), None, "wheat bhakri|bhakhri")
R("Malabar parotta", "bread", V, 7, 47, 15, 2, n("parotta", 100), None, "kerala parotta|porotta|barotta|layered parotta")
R("Pav", "bread", V, 8.5, 50, 4, 2.4, n("pav", 40), "2 pavs", "ladi pav|pao|bun|dinner roll")
R("Sheermal", "bread", V, 8, 52, 12, 2, n("sheermal", 70), None, "shirmal")
R("Baati", "bread", V, 8, 52, 15, 6, n("baati", 70), None, "bati|dal baati (baati)")
R("Litti", "bread", V, 9, 45, 10, 7, n("litti", 80), None, "sattu litti")
R("Kuttu ki puri", "bread", V, 6, 42, 18, 5, n("kuttu puri", 35), None, "buckwheat puri|vrat puri", "fried")

# =======================================================================================
# RICE
# =======================================================================================
R("Steamed rice", "rice", V, 2.7, 28.2, 0.3, 0.4, rice(150), None, "chawal|plain rice|boiled rice|white rice|sadam|annam|bhaat")
R("Brown rice", "rice", V, 2.6, 23.5, 0.9, 1.8, rice(150), None, "cooked brown rice|brown chawal")
R("Matta rice", "rice", V, 2.6, 25, 0.5, 1.5, rice(150), None, "kerala red rice|rosematta|kuthari|red rice")
R("Basmati rice (cooked)", "rice", V, 3, 28, 0.4, 0.5, rice(150), None, "cooked basmati|basmati chawal")
R("Jeera rice", "rice", V, 2.8, 28, 3.5, 0.6, rice(150), None, "cumin rice|zeera rice")
R("Ghee rice", "rice", V, 3, 29, 6, 0.6, rice(150), None, "neychoru|nei choru|ghee bhaat")
R("Lemon rice", "rice", V, 3, 27, 5.5, 1, rice(150), None, "chitranna|elumichai sadam|nimmakaya pulihora")
R("Tamarind rice", "rice", V, 3.2, 30, 7, 1.8, rice(150), None, "puliyogare|puliyodharai|pulihora|imli rice")
R("Coconut rice", "rice", V, 3, 27, 8, 2, rice(150), None, "thengai sadam|kobbari annam")
R("Curd rice", "rice", V, 3.2, 18, 3.5, 0.4, rice(200), None, "thayir sadam|dahi chawal|mosaranna|daddojanam")
R("Tomato rice", "rice", V, 3, 26, 5, 1.2, rice(150), None, "tomato bath|thakkali sadam")
R("Vangi bath", "rice", V, 3, 25, 6, 2.2, rice(150), None, "brinjal rice|vangi bhath")
R("Veg pulao", "rice", V, 3.3, 25, 4.5, 1.5, rice(150), None, "pulav|vegetable pulao|veg pulav")
R("Matar pulao", "rice", V, 3.8, 26, 4.5, 2, rice(150), None, "peas pulao|green peas pulav")
R("Kashmiri pulao", "rice", V, 3.5, 30, 7, 1.2, rice(150), None, "kashmiri pulav|dry fruit pulao")
R("Veg biryani", "rice", V, 3.5, 25, 5.5, 1.8, [("1 plate", 300), ("1 katori", 150)], None, "vegetable biryani|veg dum biryani|tahari")
R("Paneer biryani", "rice", V, 6, 24, 8, 1.5, [("1 plate", 300), ("1 katori", 150)], None, "paneer dum biryani")
R("Chicken biryani", "rice", NV, 9, 22, 7, 1, [("1 plate", 300), ("1 katori", 150)], None, "murgh biryani|chicken dum biryani|hyderabadi biryani|biriyani")
R("Mutton biryani", "rice", NV, 9.5, 21, 8.5, 1, [("1 plate", 300), ("1 katori", 150)], None, "gosht biryani|lamb biryani|mutton dum biryani")
R("Egg biryani", "rice", NV, 6.5, 23, 6.5, 1, [("1 plate", 300), ("1 katori", 150)], None, "anda biryani|muttai biryani")
R("Prawn biryani", "rice", NV, 8.5, 22, 6, 1, [("1 plate", 300), ("1 katori", 150)], None, "shrimp biryani|jhinga biryani|chemmeen biryani")
R("Fish biryani", "rice", NV, 9, 21, 6.5, 1, [("1 plate", 300), ("1 katori", 150)], None, "meen biryani")
R("Kolkata biryani", "rice", NV, 8, 24, 7, 1.2, [("1 plate", 350), ("1 katori", 150)], None, "calcutta biryani|kolkata chicken biryani")
R("Bisi bele bath", "rice", V, 4, 18, 4.5, 2.5, rice(200), None, "bisibelebath|bisi bele bhath|sambar rice (karnataka)")
R("Sambar rice", "rice", V, 3, 19, 3, 1.8, rice(200), None, "sambar sadam|sambar annam")
R("Rasam rice", "rice", V, 2.5, 20, 2, 0.8, rice(200), None, "rasam sadam|charu annam")
R("Dal khichdi", "rice", V, 4, 17, 2.5, 1.5, rice(200), None, "khichdi|khichri|khichuri|dal khichri")
R("Moong dal khichdi", "rice", V, 4.5, 18, 3, 1.8, rice(200), None, "moong khichdi|yellow moong khichdi")
R("Masala khichdi", "rice", V, 4, 17, 4.5, 2, rice(200), None, "vegetable khichdi|masala khichuri")
R("Rajma chawal", "rice", V, 5, 22, 3.5, 3, plate(350), None, "rajma rice|rajma chaawal")
R("Kadhi chawal", "rice", V, 3.2, 20, 4, 0.7, plate(350), None, "kadhi rice")
R("Dal chawal", "rice", V, 4.5, 21, 2.5, 1.8, plate(350), None, "dal rice|dal bhaat|varan bhaat|pappu annam")
R("Chole chawal", "rice", V, 5, 23, 5, 3.2, plate(350), None, "chole rice|chana chawal")
R("Rice kanji", "rice", V, 1.2, 10, 0.2, 0.2, bowl(250), None, "kanji|ganji|pej|rice porridge|congee")

# =======================================================================================
# DALS
# =======================================================================================
R("Dal tadka", "dal", V, 5.5, 14, 3.5, 2.8, kat(), None, "tadka dal|yellow dal|dal tarka|toor dal tadka")
R("Dal fry", "dal", V, 5.8, 14.5, 4.5, 3, kat(), None, "dal fry restaurant style|fried dal")
R("Dal makhani", "dal", V, 5.5, 13, 9, 3.5, kat(), None, "dal makhni|maa ki dal makhani|black dal")
R("Toor dal", "dal", V, 6, 15, 1, 3, kat(), None, "arhar dal|tuvar dal|plain dal|toovar paruppu|kandi pappu")
R("Moong dal", "dal", V, 6, 13, 2.5, 2.5, kat(), None, "yellow moong dal|mung dal|pesara pappu|paasi paruppu")
R("Masoor dal", "dal", V, 6.5, 14, 3, 2.8, kat(), None, "red lentil dal|lal masoor dal|musur dal")
R("Chana dal", "dal", V, 7, 17, 3.5, 4.5, kat(), None, "bengal gram dal|chanyachi dal|kadalai paruppu")
R("Urad dal", "dal", V, 7, 15, 3.5, 3, kat(), None, "dhuli urad dal|white urad dal|split black gram dal")
R("Kaali dal", "dal", V, 6, 14, 6, 4, kat(), None, "maa ki dal|sabut urad dal|kali dal")
R("Dal palak", "dal", V, 5, 11, 3.5, 3, kat(), None, "palak dal|spinach dal|keerai kootu")
R("Panchmel dal", "dal", V, 6.2, 14, 4, 3.2, kat(), None, "panchratna dal|five lentil dal")
R("Dalma", "dal", V, 4.5, 12, 2.5, 3.5, kat(), None, "odia dalma|dal with vegetables")
R("Cholar dal", "dal", V, 6.5, 16, 5, 4, kat(), None, "chholar dal|bengali chana dal")
R("Amti", "dal", V, 5, 13, 3.5, 2.8, kat(), None, "maharashtrian amti|katachi amti|varan")
R("Gujarati dal", "dal", V, 4.5, 13, 2.5, 2.2, kat(), None, "khatti meethi dal|gujarati toor dal")
R("Dal dhokli", "dal", V, 5, 18, 4, 2.5, kat(200), None, "dal dhokali|varan phal")
R("Pappu", "dal", V, 6, 13, 3, 2.5, kat(), None, "tomato pappu|andhra dal|mudda pappu")
R("Kulthi dal", "dal", V, 7, 15, 2.5, 3.5, kat(), None, "horse gram dal|ulavalu charu|kollu|hurali saaru")
R("Sambar", "dal", V, 3, 9.5, 2.2, 2.4, kat(), None, "sambhar|sambaar|saambar|kuzhambu")
R("Moong curry", "dal", V, 6.5, 14, 3.5, 4, kat(), None, "sabut moong|whole moong dal|green moong curry")
R("Dal (no oil, boiled)", "dal", V, 6.5, 15.5, 0.5, 3.2, kat(), None, "boiled dal|plain boiled lentils|patla dal")

# =======================================================================================
# LEGUME CURRIES
# =======================================================================================
R("Rajma", "curry", V, 6, 16, 4, 5, kat(), None, "rajma masala|red kidney bean curry")
R("Chole", "curry", V, 6.5, 20, 6, 5.5, kat(), None, "chana masala|chhole|chickpea curry|pindi chole|kabuli chana")
R("Kala chana curry", "curry", V, 7, 18, 5, 6, kat(), None, "kala chana|black chickpea curry|kadala curry")
R("Lobia curry", "curry", V, 6, 16, 4, 4.5, kat(), None, "lobia masala|black eyed peas curry|chawli usal|alasande")
R("Matki usal", "curry", V, 6.5, 15, 4, 4.5, kat(), None, "moth bean usal|matkichi usal|sprouts usal")
R("Ghugni", "curry", V, 6, 17, 4, 5, kat(), None, "ghugni chaat|dried peas curry|matar ghugni")
R("Soya chunks curry", "curry", V, 9, 9, 5, 3, kat(), None, "meal maker curry|soya bean curry|nutri curry")
R("Kootu", "curry", V, 4, 9, 4, 3, kat(), None, "koottu|poricha kootu")
R("Chana sundal", "snack", V, 7, 18, 3.5, 6, kat(100), None, "sundal|kadalai sundal|chickpea sundal")

# =======================================================================================
# VEGETABLE CURRIES / SABZIS
# =======================================================================================
R("Sabzi (mixed veg)", "curry", V, 2.5, 9, 6, 3, kat(), None, "mixed veg sabzi|mix veg|tarkari|subzi|bhaji")
R("Mixed veg curry", "curry", V, 3, 9, 9, 3, kat(), None, "mix veg curry|restaurant mixed vegetable")
R("Aloo gobi", "curry", V, 2.5, 12, 6, 2.8, kat(), None, "alu gobi|potato cauliflower sabzi|aloo gobhi")
R("Bhindi masala", "curry", V, 2.5, 9, 8, 3.5, kat(), None, "okra masala|bhendi masala|bhindi sabzi")
R("Bhindi fry", "curry", V, 2.5, 9, 10, 3.5, kat(100), None, "okra fry|vendakkai poriyal|bhendi fry|kurkuri bhindi")
R("Baingan bharta", "curry", V, 2, 8, 6, 3, kat(), None, "baingan ka bharta|begun pora|vangyache bharit|brinjal mash")
R("Bagara baingan", "curry", V, 2.5, 9, 11, 3.5, kat(), None, "baghare baingan|brinjal masala|gutti vankaya")
R("Aloo baingan", "curry", V, 2, 11, 6, 3, kat(), None, "potato brinjal sabzi|aloo vangi")
R("Aloo matar", "curry", V, 3.2, 14, 6, 3.2, kat(), None, "aloo mutter|potato peas curry")
R("Jeera aloo", "curry", V, 2, 17, 5.5, 2, kat(), None, "aloo jeera|cumin potatoes|jeera alu")
R("Dum aloo", "curry", V, 2.2, 15, 9, 2, kat(), None, "dum alu|kashmiri dum aloo")
R("Aloo sabzi", "curry", V, 2, 14, 5, 1.8, kat(), None, "potato curry|batata bhaji|aloo ki sabzi|urulai kizhangu")
R("Aloo methi", "curry", V, 2.8, 13, 6, 3, kat(), None, "methi aloo|potato fenugreek")
R("Aloo palak", "curry", V, 2.8, 10, 5.5, 2.8, kat(), None, "palak aloo|spinach potato")
R("Shimla mirch aloo", "curry", V, 2, 11, 5.5, 2.5, kat(), None, "capsicum aloo|aloo capsicum")
R("Sarson ka saag", "curry", V, 3, 6, 6, 3.2, kat(), None, "sarson da saag|mustard greens curry|saag")
R("Navratan korma", "curry", V, 4, 10, 12, 2.5, kat(), None, "navaratna korma")
R("Veg kolhapuri", "curry", V, 3, 10, 9, 3.2, kat(), None, "vegetable kolhapuri")
R("Veg jalfrezi", "curry", V, 2.5, 9, 7, 2.5, kat(), None, "vegetable jalfrezi")
R("Malai kofta", "curry", V, 5, 12, 17, 1.8, kat(), None, "malai kofta curry")
R("Methi matar malai", "curry", V, 5, 9, 14, 2.5, kat(), None, "methi mutter malai")
R("Matar mushroom", "curry", V, 3.5, 8, 7, 2.4, kat(), None, "mushroom matar|mutter mushroom")
R("Mushroom masala", "curry", V, 3, 6, 7, 1.8, kat(), None, "kadai mushroom|mushroom curry")
R("Cabbage sabzi", "curry", V, 1.8, 7, 5, 2.5, kat(), None, "patta gobhi sabzi|kobi bhaji|cabbage curry")
R("Cabbage poriyal", "curry", V, 1.8, 7, 6, 2.8, kat(), None, "muttaikose poriyal|cabbage palya|cabbage thoran")
R("Beans poriyal", "curry", V, 2.2, 8, 6, 3.5, kat(), None, "beans thoran|beans palya|french beans sabzi")
R("Beetroot poriyal", "curry", V, 2, 10, 5.5, 2.8, kat(), None, "beetroot thoran|beetroot palya")
R("Thoran", "curry", V, 2.5, 8, 7, 3.5, kat(), None, "vegetable thoran|upperi")
R("Avial", "curry", V, 2.5, 8, 7.5, 3, kat(), None, "aviyal|avail")
R("Olan", "curry", V, 1.5, 6, 6, 1.5, kat(), None, "kerala olan")
R("Erissery", "curry", V, 3, 12, 6, 3, kat(), None, "pumpkin erissery|mathan erissery")
R("Karela fry", "curry", V, 2.5, 10, 11, 3.5, kat(100), None, "karela sabzi|bitter gourd fry|pavakkai fry")
R("Lauki sabzi", "curry", V, 1, 5, 3, 1.5, kat(), None, "ghiya sabzi|dudhi bhaji|bottle gourd curry|sorakaya kura")
R("Lauki chana dal", "curry", V, 3, 8, 3.5, 2.5, kat(), None, "dudhi chana dal|bottle gourd dal")
R("Turai sabzi", "curry", V, 1.3, 5, 3.5, 1.5, kat(), None, "tori sabzi|ridge gourd curry|beerakaya kura")
R("Tinda masala", "curry", V, 1.5, 6, 4, 2, kat(), None, "tinda sabzi|round gourd curry")
R("Parwal sabzi", "curry", V, 2, 7, 5, 3, kat(), None, "potol sabzi|pointed gourd curry|parval")
R("Kaddu sabzi", "curry", V, 1.2, 9, 3.5, 1.5, kat(), None, "khatta meetha kaddu|pumpkin sabzi|kashiphal")
R("Arbi masala", "curry", V, 2, 17, 6, 3, kat(), None, "arbi fry|colocasia curry|seppankizhangu roast")
R("Kathal sabzi", "curry", V, 2.2, 12, 6, 3.5, kat(), None, "jackfruit curry|kathal ki sabzi|echor dalna")
R("Undhiyu", "curry", V, 4, 15, 10, 4.5, kat(), None, "undhiya|oondhiyu")
R("Sev tamatar", "curry", V, 4, 12, 11, 2.5, kat(), None, "sev tameta nu shaak|sev tomato curry")
R("Pithla", "curry", V, 7, 13, 6, 4, kat(), None, "zunka|pitla|besan curry")
R("Bharli vangi", "curry", V, 3, 10, 11, 3.5, kat(), None, "stuffed brinjal|bharwa baingan")
R("Shukto", "curry", V, 2.5, 9, 6, 2.8, kat(), None, "shukto bengali")
R("Aloo posto", "curry", V, 3.5, 15, 10, 2.8, kat(), None, "alu posto|potato poppy seed")
R("Potol dalna", "curry", V, 2, 10, 6, 2.5, kat(), None, "aloo potol dalna|parwal curry bengali")
R("Mochar ghonto", "curry", V, 3, 11, 6, 4.5, kat(), None, "banana flower curry|mocha ghonto|vazhaipoo poriyal")
R("Veg kurma", "curry", V, 3, 9, 9, 2.5, kat(), None, "vegetable kurma|veg korma|kurma")
R("Veg stew", "curry", V, 2, 8, 7, 2, kat(), None, "kerala vegetable stew|ishtu")
R("Gatte ki sabzi", "curry", V, 7, 15, 8, 3, kat(), None, "gatta curry|besan gatte")
R("Ker sangri", "curry", V, 5, 15, 10, 9, kat(100), None, "ker sangri sabzi")
R("Kadhi", "curry", V, 3, 6, 4, 0.4, kat(), None, "gujarati kadhi|plain kadhi|majjige huli|mor kuzhambu")
R("Kadhi pakora", "curry", V, 3.5, 9, 6.5, 1, kat(), None, "pakoda kadhi|kadhi pakoda|punjabi kadhi")
R("Mirchi ka salan", "curry", V, 3, 9, 12, 3, kat(100), None, "mirchi salan|chilli salan")
R("Palak sabzi", "curry", V, 3, 5, 5, 2.5, kat(), None, "palak bhaji|spinach stir fry|keerai poriyal")
R("Methi sabzi", "curry", V, 3.5, 7, 6, 3.5, kat(100), None, "methi bhaji|fenugreek leaves sabzi")
R("Gavar sabzi", "curry", V, 3, 10, 5, 3.5, kat(), None, "cluster beans sabzi|gawar phali|kothavarangai poriyal")
R("Tindora sabzi", "curry", V, 1.5, 6, 6, 2, kat(), None, "kundru sabzi|dondakaya fry|kovakkai poriyal|ivy gourd fry")
R("Suran sabzi", "curry", V, 1.8, 18, 5, 2, kat(), None, "elephant foot yam curry|jimikand sabzi|senai roast")
R("Raw banana fry", "curry", V, 1.5, 22, 7, 2.5, kat(100), None, "vazhakkai fry|kacche kele ki sabzi|plantain fry")
R("Corn palak", "curry", V, 4, 11, 7, 2.8, kat(), None, "palak corn|spinach corn curry")

# =======================================================================================
# PANEER
# =======================================================================================
R("Paneer", "dairy", V, 18.3, 1.2, 20.8, 0, [("1 cube (20 g)", 20), ("1 katori, cubed", 100)], "1 katori, cubed", "cottage cheese|chhena (pressed)|panir")
R("Low fat paneer", "dairy", V, 22, 3, 8, 0, [("1 katori, cubed", 100)], None, "toned milk paneer|lite paneer")
R("Paneer tikka", "curry", V, 16, 7, 18, 1, n("piece", 30, "pieces", (4, 6)), "6 pieces", "paneer tikka dry|tandoori paneer")
R("Paneer butter masala", "curry", V, 8, 8, 17, 1.5, kat(), None, "paneer makhani|butter paneer|paneer makhanwala")
R("Palak paneer", "curry", V, 7, 6, 11, 2.2, kat(), None, "saag paneer|spinach paneer")
R("Kadai paneer", "curry", V, 9, 8, 14, 2, kat(), None, "karahi paneer|kadhai paneer")
R("Shahi paneer", "curry", V, 8, 8, 18, 1.2, kat(), None, "paneer shahi korma")
R("Matar paneer", "curry", V, 7.5, 9, 11, 2.5, kat(), None, "mutter paneer|peas paneer")
R("Paneer bhurji", "curry", V, 13, 5, 16, 1, kat(100), None, "scrambled paneer|paneer bhurjee")
R("Paneer do pyaza", "curry", V, 9, 8, 14, 2, kat(), None, "paneer do pyaaza")
R("Paneer tikka masala", "curry", V, 9.5, 8, 15, 1.5, kat(), None, "paneer tikka gravy")
R("Chilli paneer", "curry", V, 11, 12, 15, 1.5, kat(), None, "chili paneer|paneer chilli dry", "fast_food")
R("Paneer pakora", "snack", V, 11, 15, 19, 1.5, n("piece", 25), "2 pieces", "paneer pakoda|paneer bhaji", "fried")

# =======================================================================================
# EGG
# =======================================================================================
R("Boiled egg", "egg", NV, 12.6, 1.1, 10.6, 0, n("egg", 50), "1 egg", "anda|ubla anda|hard boiled egg|muttai")
R("Boiled egg white", "egg", NV, 10.9, 0.7, 0.2, 0, n("egg white", 33), None, "egg white|anda safedi")
R("Omelette", "egg", NV, 10.5, 3, 13, 0.5, n("omelette (2 eggs)", 120, "omelettes (2 eggs each)", (1,)), None, "omlet|anda omelette|onion omelette|amlet")
R("Masala omelette", "egg", NV, 10, 4, 14, 0.8, n("masala omelette (2 eggs)", 130, "masala omelettes", (1,)), None, "masala omlet|spicy omelette")
R("Egg half fry", "egg", NV, 13, 0.8, 17, 0, n("egg", 55), "1 egg", "sunny side up|fried egg|bullseye|egg fry")
R("Egg bhurji", "egg", NV, 11, 4, 13, 0.8, kat(100), None, "anda bhurji|scrambled eggs indian|egg podimas|egg burji")
R("Egg curry", "egg", NV, 8, 5, 10, 1, kat(), None, "anda curry|egg masala|muttai kuzhambu|dimer dalna")
R("Egg roast", "egg", NV, 9, 6, 12, 1.5, kat(), None, "kerala egg roast|mutta roast")

# =======================================================================================
# CHICKEN
# =======================================================================================
R("Tandoori chicken", "meat", NV, 25, 3, 8, 0.5, [("1 leg piece", 120), ("1/2 chicken", 250), ("1 plate (4 pieces)", 300)], "1 leg piece", "tandoori murgh")
R("Butter chicken", "curry", NV, 13, 6, 13, 0.8, kat(), None, "murgh makhani|chicken makhani|butter chicken gravy")
R("Chicken curry", "curry", NV, 13, 5, 9, 1, kat(), None, "murgh curry|chicken gravy|kozhi curry|home style chicken curry")
R("Chicken tikka", "meat", NV, 24, 4, 7, 0.8, n("piece", 30, "pieces", (4, 6)), "6 pieces", "murgh tikka|chicken tikka dry")
R("Chicken tikka masala", "curry", NV, 13, 6, 11, 1, kat(), None, "chicken tikka gravy|CTM")
R("Kadai chicken", "curry", NV, 14, 5, 11, 1.2, kat(), None, "karahi chicken|kadhai chicken")
R("Chicken korma", "curry", NV, 13, 6, 14, 1, kat(), None, "murgh korma|chicken kurma")
R("Chicken 65", "meat", NV, 20, 10, 14, 0.8, kat(100), None, "chicken sixty five", "fried")
R("Chilli chicken", "meat", NV, 16, 11, 12, 1, kat(), None, "chili chicken|chilli chicken dry", "fast_food")
R("Chicken chettinad", "curry", NV, 15, 5, 11, 1.5, kat(), None, "chettinad chicken|kozhi chettinad")
R("Chicken do pyaza", "curry", NV, 14, 6, 10, 1.2, kat(), None, "murgh do pyaza")
R("Chicken keema", "meat", NV, 16, 5, 11, 1.2, kat(), None, "chicken kheema|minced chicken curry")
R("Chicken fry", "meat", NV, 20, 6, 15, 1, kat(100), None, "kerala chicken fry|kozhi varuval|chicken roast")
R("Chicken lollipop", "meat", NV, 18, 12, 16, 0.5, n("lollipop", 40), "2 lollipops", "chicken lollypop|drums of heaven", "fried")
R("Chicken seekh kebab", "meat", NV, 18, 4, 12, 0.6, n("seekh kebab", 50), "2 seekh kebabs", "chicken seekh|murgh seekh kebab")
R("Chicken malai tikka", "meat", NV, 22, 3, 11, 0.3, n("piece", 30, "pieces", (4, 6)), "6 pieces", "murgh malai tikka|reshmi tikka")
R("Chicken stew", "curry", NV, 10, 5, 9, 1, kat(), None, "kerala chicken stew|chicken ishtu")
R("Pepper chicken", "meat", NV, 18, 5, 12, 1, kat(), None, "chicken pepper fry|kozhi milagu")
R("Chicken sukka", "meat", NV, 18, 6, 14, 2.5, kat(), None, "chicken ghee roast|kori sukka")
R("Chicken xacuti", "curry", NV, 14, 6, 13, 2, kat(), None, "goan chicken xacuti")
R("Chicken saag", "curry", NV, 13, 5, 9, 2, kat(), None, "palak chicken|saagwala chicken")
R("Chicken biryani (restaurant)", "rice", NV, 8.5, 24, 9, 1, [("1 plate", 400), ("1 katori", 150)], None, "restaurant biryani|dum biryani takeaway")

# =======================================================================================
# MUTTON / GOAT
# =======================================================================================
R("Mutton curry", "curry", NV, 14, 4, 13, 0.8, kat(), None, "gosht curry|goat curry|mutton masala|kosha|mamsam kura")
R("Rogan josh", "curry", NV, 14, 4, 14, 0.8, kat(), None, "mutton rogan josh|roghan josh")
R("Mutton keema", "meat", NV, 15, 5, 15, 1.2, kat(), None, "keema|kheema|minced mutton|keema masala")
R("Keema matar", "curry", NV, 13, 7, 13, 2.5, kat(), None, "keema mutter|kheema peas")
R("Mutton korma", "curry", NV, 13, 5, 16, 0.8, kat(), None, "gosht korma|lamb korma")
R("Laal maas", "curry", NV, 14, 4, 17, 1, kat(), None, "lal maas|rajasthani mutton")
R("Mutton sukka", "meat", NV, 18, 5, 16, 2, kat(), None, "mutton chukka|mutton fry|attirachi varattiyathu")
R("Nihari", "curry", NV, 11, 5, 12, 0.8, kat(), None, "nalli nihari|mutton nihari")
R("Mutton seekh kebab", "meat", NV, 16, 4, 18, 0.6, n("seekh kebab", 50), "2 seekh kebabs", "seekh kabab|lamb seekh")
R("Galouti kebab", "meat", NV, 14, 8, 20, 1, n("kebab", 40), "2 kebabs", "galawati kebab")
R("Shami kebab", "meat", NV, 15, 10, 14, 2.5, n("kebab", 45), "2 kebabs", "shami kabab", "fried")
R("Haleem", "meat", NV, 10, 12, 9, 2.5, kat(200), None, "haleem hyderabadi|khichda")
R("Mutton pepper fry", "meat", NV, 18, 4, 15, 1, kat(), None, "mutton milagu varuval")
R("Kosha mangsho", "curry", NV, 15, 5, 15, 1, kat(), None, "kasha mangsho|bengali mutton")
R("Mutton chops", "meat", NV, 17, 3, 18, 0.5, n("chop", 60), "2 chops", "lamb chops masala")

# =======================================================================================
# FISH & SEAFOOD
# =======================================================================================
R("Fish curry", "curry", NV, 12, 4, 7, 0.8, kat(), None, "machli curry|meen kuzhambu|fish gravy|macher jhol")
R("Fish fry", "seafood", NV, 20, 8, 12, 0.8, n("piece", 80), "1 piece", "tawa fish fry|machli fry|meen varuval|masala fish fry", "fried")
R("Fish tikka", "seafood", NV, 20, 4, 7, 0.5, n("piece", 30, "pieces", (4, 6)), "6 pieces", "machli tikka|tandoori fish")
R("Goan fish curry", "curry", NV, 11, 5, 10, 1.2, kat(), None, "xitti kodi|goan curry")
R("Malabar fish curry", "curry", NV, 12, 4, 9, 1, kat(), None, "kerala fish curry|meen curry|meen mulakittathu")
R("Meen moilee", "curry", NV, 11, 4, 11, 0.8, kat(), None, "fish molee|fish moily|fish moilee")
R("Doi maach", "curry", NV, 13, 4, 10, 0.5, kat(), None, "doi maachh|fish in yogurt")
R("Shorshe ilish", "curry", NV, 17, 3, 20, 0.8, kat(), None, "hilsa in mustard|sorshe ilish|ilish bhapa")
R("Prawn curry", "curry", NV, 11, 5, 9, 1, kat(), None, "jhinga curry|chemmeen curry|prawns masala curry|royyala kura")
R("Prawn masala", "seafood", NV, 15, 6, 11, 1.2, kat(), None, "prawn roast|chemmeen roast|jhinga masala")
R("Prawn fry", "seafood", NV, 18, 8, 12, 0.8, kat(100), None, "prawns fry|jhinga fry|chemmeen fry", "fried")
R("Chingri malai curry", "curry", NV, 10, 5, 15, 0.8, kat(), None, "chingri malaikari|prawn malai curry")
R("Crab curry", "curry", NV, 10, 5, 8, 1, kat(), None, "kekda curry|nandu kuzhambu|crab masala")
R("Amritsari fish", "seafood", NV, 17, 12, 14, 0.8, n("piece", 40, "pieces", (2, 4)), "4 pieces", "amritsari machhi|fish pakora", "fried")
R("Pomfret fry", "seafood", NV, 19, 5, 13, 0.5, n("pomfret", 120), "1 pomfret", "paplet fry|vavval meen fry", "fried")
R("Bangda fry", "seafood", NV, 20, 5, 14, 0.5, n("bangda", 100), "1 bangda", "mackerel fry|ayala fry|bangude fry", "fried")
R("Surmai fry", "seafood", NV, 21, 5, 11, 0.5, n("slice", 90), "1 slice", "seer fish fry|vanjaram fry|kingfish fry", "fried")
R("Fish cutlet", "seafood", NV, 12, 15, 12, 1.2, n("cutlet", 60), None, "meen cutlet|fish chop", "fried")
R("Rohu fish (raw)", "seafood", NV, 16.6, 0, 1.4, 0, [("1 piece", 100)], None, "rohu|rui|rui maach|kendai")
R("Katla fish (raw)", "seafood", NV, 17, 0, 2, 0, [("1 piece", 100)], None, "katla|catla|bocha")
R("Pomfret (raw)", "seafood", NV, 18.5, 0, 2.5, 0, [("1 medium pomfret", 150)], None, "pomfret|paplet|vavval|avoli|silver pomfret")
R("Hilsa (raw)", "seafood", NV, 21.8, 0, 19.4, 0, [("1 piece", 100)], None, "hilsa|ilish|pulasa")
R("Bombil fry", "seafood", NV, 15, 12, 12, 0.5, n("bombil", 40), "2 bombils", "bombay duck fry|bummalo fry", "fried")
R("Dried fish fry", "seafood", NV, 40, 5, 12, 0.5, [("1 small katori", 50)], None, "karuvadu fry|sukat|sukha bombil|nethili karuvadu", "fried")

# =======================================================================================
# SOUTH INDIAN BREAKFAST / TIFFIN
# =======================================================================================
R("Idli", "breakfast", V, 3.9, 27.5, 0.4, 1.5, n("idli", 40, None, (1, 2, 3)), "2 idlis", "idly|iddli|idlee|steamed rice cake")
R("Idli sambar", "breakfast", V, 3.5, 19, 1.3, 2, [("1 plate (2 idlis + sambar)", 230)], None, "idli with sambar|sambar idli")
R("Rava idli", "breakfast", V, 4.5, 24, 5, 1.2, n("rava idli", 50), "2 rava idlis", "sooji idli|semolina idli")
R("Dosa", "breakfast", V, 3.8, 28, 4, 1.2, n("dosa", 70), "1 dosa", "dosai|dosey|thosai|home dosa")
R("Plain dosa", "breakfast", V, 3.9, 29, 6, 1.2, n("plain dosa", 90), None, "sada dosa|plain dosai|restaurant dosa")
R("Masala dosa", "breakfast", V, 3.7, 26, 6.5, 2, n("masala dosa", 180), None, "masala dosai|aloo dosa")
R("Mysore masala dosa", "breakfast", V, 3.8, 26, 8, 2, n("mysore masala dosa", 200), None, "mysore dosa")
R("Rava dosa", "breakfast", V, 4, 28, 9, 1.2, n("rava dosa", 90), None, "sooji dosa|onion rava dosa")
R("Set dosa", "breakfast", V, 4, 30, 4, 1.2, n("set dosa", 60, None, (1, 3)), "3 set dosas", "sponge dosa")
R("Neer dosa", "breakfast", V, 2.5, 28, 2.5, 0.5, n("neer dosa", 50, None, (1, 3)), "3 neer dosas", "neer dose|water dosa")
R("Paper dosa", "breakfast", V, 4, 30, 8, 1.2, n("paper dosa", 100), None, "paper roast")
R("Ghee roast dosa", "breakfast", V, 4, 29, 11, 1.2, n("ghee roast", 110), None, "ghee dosa|nei roast")
R("Egg dosa", "breakfast", NV, 6.5, 24, 8, 1.2, n("egg dosa", 130), None, "muttai dosai|anda dosa")
R("Pesarattu", "breakfast", V, 7.5, 22, 5, 3.5, n("pesarattu", 100), None, "moong dal dosa|green gram dosa|pesarattu dosa")
R("Adai", "breakfast", V, 7, 24, 6, 3.5, n("adai", 100), None, "adai dosa|lentil dosa")
R("Ragi dosa", "breakfast", V, 3.5, 25, 4.5, 3, n("ragi dosa", 80), None, "finger millet dosa|nachni dosa")
R("Uttapam", "breakfast", V, 4.2, 27, 5, 1.8, n("uttapam", 150), None, "uthappam|oothappam|uttappa")
R("Onion uttapam", "breakfast", V, 4, 26, 5.5, 2, n("onion uttapam", 160), None, "onion uthappam")
R("Appam", "breakfast", V, 3, 30, 3, 0.8, n("appam", 60), "2 appams", "palappam|hoppers|vellayappam")
R("Idiyappam", "breakfast", V, 2.5, 32, 0.4, 0.8, n("idiyappam", 40, None, (1, 3)), "3 idiyappams", "string hoppers|nool puttu|sevai|noolappam")
R("Puttu", "breakfast", V, 3.5, 35, 3.5, 2, [("1 puttu", 120), ("1/2 puttu", 60)], None, "rice puttu|kutti puttu")
R("Medu vada", "breakfast", V, 8.5, 26, 18, 5, n("vada", 50), "2 vadas", "uzhunnu vada|ulundu vadai|urad vada|vadai", "fried")
R("Sambar vada", "breakfast", V, 5, 16, 8, 3, n("sambar vada", 150), None, "sambar vadai|vada sambar", "fried")
R("Masala vada", "snack", V, 10, 28, 16, 6, n("masala vada", 40), "2 masala vadas", "paruppu vadai|dal vada|chana dal vada|ambode", "fried")
R("Pongal", "breakfast", V, 4.2, 20, 6, 1.2, kat(200), None, "ven pongal|khara pongal|ghee pongal")
R("Upma", "breakfast", V, 3.5, 22, 5, 1.8, kat(200), None, "uppittu|rava upma|uppuma|sooji upma")
R("Oats upma", "breakfast", V, 4, 17, 4.5, 2.5, kat(200), None, "oats uppittu|masala oats")
R("Semiya upma", "breakfast", V, 3.5, 25, 5, 1.2, kat(200), None, "vermicelli upma|shevaya upma|sevai upma")
R("Lemon sevai", "breakfast", V, 3, 30, 4.5, 1, kat(200), None, "lemon idiyappam|sevai")
R("Kuzhi paniyaram", "breakfast", V, 4, 27, 6, 1.5, n("paniyaram", 25, None, (1, 4)), "4 paniyarams", "paddu|guntha ponganalu|appe|kuli paniyaram")
R("Mangalore buns", "breakfast", V, 6, 45, 12, 2, n("bun", 70), None, "banana buns", "fried")
R("Kozhukattai", "breakfast", V, 3, 32, 3.5, 2, n("kozhukattai", 40, None, (1, 3)), "3 kozhukattais", "pidi kozhukattai|kara kozhukattai")
R("Ragi mudde", "breakfast", V, 2.8, 28, 0.5, 4, n("ragi mudde", 150), None, "ragi ball|ragi kali|ragi sangati|mudde")
R("Poha", "breakfast", V, 2.8, 26, 4.5, 1.2, kat(150), None, "kanda poha|pohe|aval upma|avalakki|chuda|beaten rice")
R("Sabudana khichdi", "breakfast", V, 2, 35, 8, 1, kat(150), None, "sago khichdi|sabudana khichadi|javvarisi upma")

# =======================================================================================
# OTHER BREAKFAST
# =======================================================================================
R("Poori bhaji", "breakfast", V, 5, 30, 12, 3, [("1 plate (3 pooris + bhaji)", 230)], None, "puri sabzi|puri bhaji|poori masala|poori kizhangu", "fried")
R("Chole bhature", "main", V, 7, 36, 13, 4, [("1 plate (2 bhature + chole)", 360)], None, "chhole bhature|chole bhatura", "fried")
R("Besan chilla", "breakfast", V, 10, 22, 6, 4.5, n("chilla", 80), None, "besan cheela|pudla|besan ka chilla|gram flour pancake")
R("Moong dal chilla", "breakfast", V, 9.5, 20, 4.5, 3.5, n("chilla", 80), None, "moong cheela|moong dal cheela")
R("Thalipeeth", "breakfast", V, 8, 38, 10, 6, n("thalipeeth", 80), None, "bhajanee thalipeeth")
R("Daliya", "breakfast", V, 3.5, 17, 3, 3.5, kat(200), None, "savoury daliya|broken wheat upma|godhuma rava upma|dalia khichdi")
R("Sweet daliya", "breakfast", V, 4, 18, 3, 2, kat(200), None, "meetha daliya|dalia with milk|broken wheat porridge")
R("Oats porridge", "breakfast", V, 4, 12, 3, 1.5, bowl(250), None, "oatmeal with milk|oats with milk|oats kheer (breakfast)")
R("Cornflakes with milk", "breakfast", V, 4, 16, 2.5, 0.5, bowl(250), None, "cornflakes|cereal with milk")
R("Bread omelette", "breakfast", NV, 9, 22, 11, 1.5, [("1 plate (2 slices + omelette)", 150)], None, "bread omlet|anda bread", "street_food")
R("Bread butter", "breakfast", V, 7, 45, 14, 2.3, n("slice", 35), "2 slices", "bread with butter|butter toast")
R("Bread jam", "breakfast", V, 6, 58, 2.5, 2.2, n("slice", 40), "2 slices", "bread with jam|jam toast")

# =======================================================================================
# STREET FOOD & CHAAT
# =======================================================================================
R("Pani puri", "street_food", V, 3, 25, 6, 2.5, [("1 plate (6 puris)", 150), ("1 puri", 25)], None, "golgappa|puchka|gupchup|pani ke batashe|phuchka", "fried|snack")
R("Bhel puri", "street_food", V, 5, 34, 7, 3.5, plate(150), None, "bhel|bhelpuri|jhal bhel", "snack")
R("Sev puri", "street_food", V, 5, 33, 14, 3, [("1 plate (6 puris)", 120)], None, "sev batata puri", "fried|snack")
R("Dahi puri", "street_food", V, 4, 24, 7, 2, [("1 plate (6 puris)", 150)], None, "dahi batata puri", "fried|snack")
R("Papdi chaat", "street_food", V, 5, 27, 11, 2.5, plate(150), None, "papri chaat|dahi papdi", "fried|snack")
R("Aloo tikki", "street_food", V, 3, 24, 10, 2.5, n("tikki", 60), "2 tikkis", "aloo tikki|potato patty|aloo pattice", "fried|snack")
R("Aloo tikki chaat", "street_food", V, 4, 22, 9, 2.5, plate(200), None, "tikki chaat|ragda tikki", "fried|snack")
R("Samosa chaat", "street_food", V, 5, 25, 11, 3.5, plate(200), None, "samosa chole chaat", "fried|snack")
R("Dahi vada", "street_food", V, 6, 18, 5, 2, n("dahi vada", 90), None, "dahi bhalla|dahi vade|thayir vadai|dahi bara", "snack")
R("Raj kachori", "street_food", V, 6, 26, 12, 3.5, n("raj kachori", 180), None, "raaj kachori", "fried|snack")
R("Ragda pattice", "street_food", V, 4.5, 22, 6, 4, plate(250), None, "ragda patties|ragda pattis", "snack")
R("Pav bhaji", "street_food", V, 5, 25, 8, 3, [("1 plate (2 pav + bhaji)", 300)], None, "pao bhaji|bhaji pav", "fast_food")
R("Bhaji (pav bhaji)", "street_food", V, 2.8, 13, 7, 3, kat(), None, "pav bhaji bhaji|bhaji only", "-grain|vegetable")
R("Vada pav", "street_food", V, 5.5, 35, 11, 3, n("vada pav", 150), None, "wada pav|vada pao|batata vada pav", "fried|fast_food")
R("Dabeli", "street_food", V, 5, 32, 10, 3, n("dabeli", 130), None, "kutchi dabeli|double roti", "fast_food")
R("Misal pav", "street_food", V, 6, 23, 9, 4, [("1 plate (misal + 2 pav)", 300)], None, "misal|puneri misal|kolhapuri misal")
R("Paneer kathi roll", "street_food", V, 9, 26, 11, 2, n("roll", 200), None, "paneer roll|paneer frankie|paneer wrap", "fast_food")
R("Chicken roll", "street_food", NV, 11, 24, 10, 1.5, n("roll", 200), None, "chicken kathi roll|chicken frankie|chicken wrap", "fast_food")
R("Egg roll", "street_food", NV, 9, 26, 11, 1.5, n("egg roll", 180), None, "anda roll|egg kathi roll|egg frankie", "fast_food")
R("Veg frankie", "street_food", V, 5, 30, 9, 2.5, n("frankie", 180), None, "veg roll|veg kathi roll|veg wrap", "fast_food")
R("Chicken shawarma", "street_food", NV, 11, 20, 10, 1.5, n("shawarma", 250), None, "shawarma roll|chicken shawarma wrap", "fast_food")
R("Veg momos", "street_food", V, 4, 26, 3, 2, [("1 plate (6 momos)", 150), ("1 momo", 25)], None, "momo|steamed momos|vegetable dumplings|dim sum", "fast_food")
R("Chicken momos", "street_food", NV, 8, 22, 4, 1.2, [("1 plate (6 momos)", 150), ("1 momo", 25)], None, "chicken momo|chicken dumplings", "fast_food")
R("Fried momos", "street_food", V, 5, 28, 12, 2, [("1 plate (6 momos)", 150), ("1 momo", 25)], None, "fried veg momos|kurkure momos", "fried|fast_food")
R("Chole kulche", "street_food", V, 6, 30, 8, 4.5, [("1 plate (2 kulche + chole)", 300)], None, "chole kulcha|matar kulcha")
R("Bread pakora", "street_food", V, 6, 28, 14, 2, n("bread pakora", 80), None, "bread pakoda|bread bajji", "fried|snack")
R("Mirchi bajji", "street_food", V, 4, 20, 14, 3, n("bajji", 50), "2 bajjis", "mirchi vada|chilli bajji|mirchi pakoda|milagai bajji", "fried|snack")
R("Bun maska", "street_food", V, 7, 48, 15, 2, n("bun maska", 80), None, "bun butter|maska pav")
R("Masala corn", "street_food", V, 3.5, 19, 2.5, 2.5, [("1 cup", 150)], None, "corn chaat|sweet corn cup|bhutta masala", "snack")
R("Bhutta", "street_food", V, 3.4, 21, 1.5, 2.4, n("bhutta (cob)", 150, "bhuttas"), "1 bhutta (cob)", "roasted corn on the cob|butta|makai", "snack")
R("Jhal muri", "street_food", V, 5, 40, 8, 3, bowl(100), None, "jhalmuri|masala puffed rice|churumuri|bhel muri", "snack")
R("Kachori sabzi", "street_food", V, 6, 32, 16, 3.5, [("1 plate (2 kachori + sabzi)", 220)], None, "kachori aloo|bedmi puri aloo|khasta kachori sabzi", "fried")
R("Aloo chaat", "street_food", V, 2.5, 22, 6, 2.5, plate(150), None, "alu chaat|fried potato chaat", "snack")
R("Chana chaat", "street_food", V, 7, 20, 3.5, 6, plate(150), None, "chole chaat|kabuli chana chaat", "snack")
R("Sprouts chaat", "street_food", V, 5, 13, 1.5, 3.5, plate(150), None, "moong sprouts chaat|ankurit chaat|sprouted moong salad", "snack")
R("Ram ladoo", "street_food", V, 10, 30, 12, 5, plate(100), None, "moong dal pakodi|ram laddu", "fried|snack")
R("Litti chokha", "street_food", V, 8, 38, 9, 6, [("1 plate (2 litti + chokha)", 250)], None, "litti choka|litti with chokha")
R("Bombay sandwich", "street_food", V, 5, 28, 8, 3, n("sandwich", 150), None, "veg sandwich|bombay masala sandwich", "fast_food")
R("Veg cheese grilled sandwich", "street_food", V, 8, 28, 12, 2.5, n("sandwich", 160), None, "grilled sandwich|cheese sandwich", "fast_food")
R("Egg bhurji pav", "street_food", NV, 9, 24, 10, 1.8, [("1 plate (bhurji + 2 pav)", 230)], None, "anda bhurji pav|egg burji pav")
R("Tawa pulao", "street_food", V, 3.5, 25, 6, 2, plate(250), None, "mumbai tawa pulao", "fast_food")
R("Kulhad chai", "beverage", V, 1.6, 7.5, 1.6, 0, [("1 kulhad", 120)], None, "kullad chai|matka chai")

# =======================================================================================
# SNACKS & NAMKEEN
# =======================================================================================
R("Samosa", "snack", V, 5, 30, 17, 3, n("samosa", 100), None, "singara|aloo samosa|samsa", "fried")
R("Punjabi samosa", "snack", V, 5, 31, 18, 3, n("samosa", 130), None, "big samosa", "fried")
R("Onion samosa", "snack", V, 6, 38, 20, 3, n("onion samosa", 30, None, (2, 4)), "2 onion samosas", "irani samosa|patti samosa", "fried")
R("Pakora", "snack", V, 7, 25, 17, 3.5, [("1 plate", 100), ("1 piece", 20)], "1 plate", "pakoda|bhajiya|bhaji|pakodi|mix pakora", "fried")
R("Onion pakora", "snack", V, 6.5, 24, 18, 3.5, [("1 plate", 100), ("1 piece", 20)], "1 plate", "kanda bhaji|onion bhaji|ulli pakodi|pyaz pakoda|vengaya pakoda", "fried")
R("Aloo bonda", "snack", V, 4.5, 28, 13, 2.5, n("bonda", 60), None, "batata vada|urulai bonda|potato bonda", "fried")
R("Mysore bonda", "snack", V, 5, 30, 14, 1.5, n("bonda", 40, None, (2, 4)), "2 bondas", "goli baje|mysore bajji", "fried")
R("Kachori", "snack", V, 7, 42, 25, 4, n("kachori", 60), None, "khasta kachori|moong dal kachori|pyaz kachori", "fried")
R("Dhokla", "snack", V, 6, 24, 4, 2, n("piece", 30, "pieces", (2, 4)), "4 pieces", "khaman|khaman dhokla|dhokla gujarati")
R("Khandvi", "snack", V, 6, 14, 6, 1.5, n("piece", 20, "pieces", (3, 6)), "6 pieces", "suralichi vadi|patuli")
R("Handvo", "snack", V, 6, 22, 8, 3, n("piece", 80), None, "handwa")
R("Khakhra", "snack", V, 11, 60, 12, 8, n("khakhra", 20), None, "khakra")
R("Murukku", "snack", V, 7, 55, 26, 4, [("1 piece", 15), ("1 handful", 30)], None, "chakli|chakri|murkku|jantikalu", "fried")
R("Mathri", "snack", V, 7, 50, 28, 2.5, n("mathri", 20), None, "mathiya|mathi", "fried")
R("Namak pare", "snack", V, 7, 52, 26, 2, handful(30), None, "namakpare|nimki|khara biscuit", "fried")
R("Aloo bhujia", "snack", V, 10, 40, 40, 5, handful(30), None, "bhujia|aloo bhujiya|bikaneri bhujia", "fried")
R("Sev", "snack", V, 13, 45, 34, 6, handful(30), None, "besan sev|nylon sev|omapodi|ratlami sev", "fried")
R("Chivda", "snack", V, 8, 50, 30, 4, handful(30), None, "chevda|poha chivda|mixture|makai chivda", "fried")
R("Namkeen mixture", "snack", V, 12, 45, 35, 6, handful(30), None, "bombay mix|kara mixture|namkeen|chanachur|dalmoth", "fried")
R("Banana chips (Kerala)", "snack", V, 2.5, 56, 34, 5, handful(30), None, "nendran chips|upperi|kaya varuthathu|kele ke chips", "fried")
R("Masala peanuts", "snack", V, 18, 30, 38, 6, handful(30), None, "masala moongphali|coated peanuts|masala kadalai", "fried")
R("Roasted chana", "snack", V, 22, 58, 5.5, 16, handful(30), None, "bhuna chana|chana|pottukadalai|dalia (roasted gram)|putani|bhune chane")
R("Chana jor garam", "snack", V, 18, 50, 10, 12, handful(30), None, "chana jor|chana chor garam")
R("Makhana", "snack", V, 9.7, 76.9, 0.1, 7.6, [("1 cup", 15), ("1 handful", 10)], "1 cup", "fox nut|lotus seeds|phool makhana|gorgon nut")
R("Roasted makhana", "snack", V, 9, 70, 8, 7, [("1 cup", 15), ("1 bowl", 30)], "1 bowl", "ghee roasted makhana|masala makhana")
R("Murmura", "snack", V, 7.5, 78, 0.5, 1.5, [("1 cup", 15), ("1 bowl", 30)], "1 bowl", "puffed rice|kurmura|mamra|pori|muri|borugulu")
R("Sabudana vada", "snack", V, 3, 35, 14, 1.5, n("sabudana vada", 50), "2 sabudana vadas", "sago vada|sabudana wada", "fried")
R("Methi na gota", "snack", V, 8, 30, 17, 5, [("1 plate", 100), ("1 piece", 20)], "1 plate", "methi pakoda|methi gota", "fried")
R("Kothimbir vadi", "snack", V, 7, 24, 14, 4, n("piece", 30, "pieces", (2, 4)), "4 pieces", "kothimbir wadi|coriander fritters", "fried")
R("Patra", "snack", V, 5, 22, 8, 4, n("piece", 30, "pieces", (2, 4)), "4 pieces", "alu vadi|pathrode|patrode|patra vadi")
R("Fafda", "snack", V, 11, 45, 30, 4, [("1 plate", 100), ("1 piece", 15)], "1 plate", "fafda gathiya", "fried")
R("Gathiya", "snack", V, 11, 48, 33, 4.5, handful(30), None, "ganthiya|bhavnagari gathiya", "fried")
R("Veg cutlet", "snack", V, 4, 22, 10, 3, n("cutlet", 60), None, "vegetable cutlet|aloo cutlet|veg tikki", "fried")
R("Bhakarwadi", "snack", V, 8, 50, 28, 3, handful(30), None, "bakarwadi|bhakar wadi", "fried")
R("Thattai", "snack", V, 8, 55, 24, 4, n("thattai", 15, None, (2, 4)), "2 thattais", "nippattu|chekkalu|ellu adai", "fried")
R("Papad (roasted)", "snack", V, 25, 60, 3.3, 18.6, n("papad", 12), None, "papadum|appalam|pappad|roasted papad")
R("Papad (fried)", "snack", V, 20, 48, 22, 15, n("papad", 15), None, "fried papad|fried appalam|pappadam", "fried")
R("Masala papad", "snack", V, 12, 35, 14, 10, n("masala papad", 40), None, "papad masala", "fried")
R("Veg puff", "snack", V, 5, 33, 20, 2, n("puff", 90), None, "vegetable puff|aloo puff|veg patties")
R("Egg puff", "snack", NV, 7.5, 30, 20, 1.5, n("puff", 100), None, "egg patties|egg puffs")
R("Chicken puff", "snack", NV, 8, 30, 20, 1.5, n("puff", 100), None, "chicken patties|chicken puffs")
R("Gobi 65", "snack", V, 4, 20, 13, 2.5, kat(100), None, "cauliflower 65|gobi fry", "fried")
R("Chilli potato", "snack", V, 3, 32, 14, 2.5, kat(), None, "honey chilli potato|chili potato", "fried|fast_food")
R("Veg spring roll", "snack", V, 4, 28, 13, 2, n("spring roll", 50), "2 spring rolls", "spring roll|veg rolls", "fried|fast_food")
R("Dal moth", "snack", V, 18, 42, 26, 8, handful(30), None, "dalmoth|moth namkeen", "fried")
R("Khari biscuit", "snack", V, 7, 52, 30, 2, n("khari", 10, None, (2, 4)), "2 kharis", "puff biscuit|khari|butter khari")
R("Nankhatai", "sweet", V, 5, 55, 28, 1.5, n("nankhatai", 20), None, "nan khatai|indian shortbread cookie")
R("Cake rusk", "snack", V, 7, 62, 14, 1.5, n("rusk", 25), None, "rusk|toast|milk rusk")
R("Salted biscuit", "snack", V, 8, 65, 20, 2.5, n("biscuit", 7, None, (2, 4)), "4 biscuits", "salty biscuit|monaco style biscuit|cream cracker")
R("Glucose biscuit", "snack", V, 7, 77, 13, 1.5, n("biscuit", 6, None, (2, 4)), "4 biscuits", "glucose biscuits|parle-g style biscuit|tea biscuit")
R("Cream biscuit", "sweet", V, 5, 70, 20, 1.5, n("biscuit", 12, None, (2, 4)), "2 biscuits", "cream biscuits|sandwich biscuit")

# =======================================================================================
# INDO-CHINESE / FAST FOOD
# =======================================================================================
R("Maggi noodles", "main", V, 3, 19, 5.5, 1, [("1 packet (cooked)", 230), ("1 bowl", 200)], None, "maggi|instant noodles|masala noodles|2 minute noodles", "fast_food")
R("Hakka noodles", "main", V, 4, 26, 6, 1.5, plate(250), None, "veg hakka noodles|veg noodles|chowmein", "fast_food")
R("Chicken hakka noodles", "main", NV, 7, 23, 7, 1.2, plate(250), None, "chicken noodles|chicken chowmein", "fast_food")
R("Veg chowmein", "main", V, 4, 27, 7, 2, plate(250), None, "street chowmein|chow mein", "fast_food")
R("Schezwan noodles", "main", V, 4, 26, 7.5, 1.6, plate(250), None, "szechuan noodles|schezwan hakka noodles", "fast_food")
R("Fried rice", "main", V, 3.5, 27, 5, 1.2, plate(250), None, "veg fried rice|vegetable fried rice", "fast_food")
R("Egg fried rice", "main", NV, 5.5, 26, 6, 1, plate(250), None, "anda fried rice", "fast_food")
R("Chicken fried rice", "main", NV, 7, 25, 6, 1, plate(250), None, "chicken fry rice", "fast_food")
R("Schezwan fried rice", "main", V, 3.5, 27, 6.5, 1.2, plate(250), None, "szechuan fried rice", "fast_food")
R("Manchurian", "main", V, 3.5, 15, 9, 2, kat(), None, "veg manchurian|manchurian gravy|veg manchurian gravy", "fast_food")
R("Gobi manchurian", "snack", V, 4, 22, 12, 2.5, kat(), None, "gobi manchurian dry|cauliflower manchurian", "fried|fast_food")
R("Chicken manchurian", "main", NV, 11, 10, 10, 0.8, kat(), None, "chicken manchurian gravy", "fast_food")
R("American chopsuey", "main", V, 4, 30, 10, 1.5, plate(250), None, "american chop suey|chopsuey", "fried|fast_food")
R("Veg burger", "main", V, 6, 32, 10, 3, n("burger", 150), None, "aloo tikki burger|veggie burger", "fast_food")
R("Masala pasta", "main", V, 4.5, 24, 6, 1.8, plate(250), None, "indian style pasta|red sauce pasta", "fast_food")
R("White sauce pasta", "main", V, 5.5, 22, 9, 1.2, plate(250), None, "pasta in white sauce|alfredo pasta", "fast_food")
R("Paneer tikka pizza", "main", V, 11, 28, 11, 1.8, [("1 slice", 80), ("1 medium pizza (6 slices)", 480)], "1 slice", "paneer pizza", "fast_food")
R("Veg pizza", "main", V, 9.5, 30, 9, 2, [("1 slice", 75), ("1 medium pizza (6 slices)", 450)], "1 slice", "veggie pizza|onion capsicum pizza", "fast_food")

# =======================================================================================
# MAINS / THALIS
# =======================================================================================
R("Veg thali", "main", V, 4.5, 19, 5, 2.5, [("1 thali", 600)], None, "north indian thali|veg meal|thali")
R("South Indian meals", "main", V, 3.5, 20, 4.5, 2, [("1 thali", 700)], None, "meals|sappadu|oota|banana leaf meal|andhra meals")
R("Gujarati thali", "main", V, 4.5, 20, 6, 2.5, [("1 thali", 650)], None, "gujju thali|kathiyawadi thali")
R("Chicken thali", "main", NV, 7, 17, 7, 1.5, [("1 thali", 650)], None, "non veg thali|chicken meals")
R("Fish thali", "main", NV, 7, 18, 5.5, 1.5, [("1 thali", 650)], None, "goan fish thali|fish meals|malvani thali")
R("Dal baati churma", "main", V, 7, 40, 16, 4.5, plate(300), None, "dal bati churma|daal baati")

# =======================================================================================
# SWEETS & DESSERTS
# =======================================================================================
R("Gulab jamun", "sweet", V, 4, 50, 13, 0.5, n("gulab jamun", 40), None, "gulab jamoon|gulabjamun|lalmohan", "fried")
R("Kala jamun", "sweet", V, 4.5, 52, 15, 0.5, n("kala jamun", 45), None, "kalo jam|kala jam", "fried")
R("Rasgulla", "sweet", V, 4, 36, 3, 0, n("rasgulla", 45), None, "rosogolla|rasagola|roshogolla|rasagulla")
R("Rasmalai", "sweet", V, 6.5, 25, 9, 0.2, n("rasmalai", 70), None, "ras malai|rossomalai")
R("Sandesh", "sweet", V, 9, 40, 12, 0, n("sandesh", 30), None, "sondesh|sandesh bengali")
R("Cham cham", "sweet", V, 6, 45, 9, 0, n("cham cham", 40), None, "chum chum|chomchom")
R("Mishti doi", "sweet", V, 4, 22, 4, 0, [("1 cup (earthen)", 100)], None, "misti doi|sweet curd|bengali sweet yogurt")
R("Jalebi", "sweet", V, 3, 60, 17, 0.5, [("1 piece", 25), ("1 plate", 100)], "1 piece", "jilebi|jilapi|zalebi|jalebi sweet", "fried")
R("Imarti", "sweet", V, 3, 58, 18, 1, n("imarti", 40), None, "jangiri|amriti|emarti", "fried")
R("Kheer", "sweet", V, 4, 22, 5, 0.2, kat(), None, "rice kheer|chawal ki kheer|payesh|kheeri")
R("Semiya payasam", "sweet", V, 4, 24, 5, 0.5, kat(), None, "seviyan kheer|vermicelli kheer|semiya kheer|sevai payasam")
R("Sheer khurma", "sweet", V, 5, 26, 9, 1, kat(), None, "sheer korma|sheer khurma eid")
R("Ada pradhaman", "sweet", V, 2.5, 32, 9, 1.5, kat(), None, "ada payasam|palada pradhaman")
R("Paal payasam", "sweet", V, 4, 20, 4.5, 0.2, kat(), None, "milk payasam|pal payasam")
R("Gajar halwa", "sweet", V, 5, 35, 12, 2, kat(100), None, "gajar ka halwa|carrot halwa|gajrela")
R("Sooji halwa", "sweet", V, 4, 40, 17, 1, kat(100), None, "rava sheera|sheera|suji ka halwa|kesari (north)")
R("Moong dal halwa", "sweet", V, 7, 42, 25, 2.5, kat(100), None, "moong ki dal ka halwa")
R("Atta halwa", "sweet", V, 5, 40, 22, 2.5, kat(100), None, "kada prasad|aate ka halwa|karah prasad")
R("Badam halwa", "sweet", V, 9, 40, 30, 4, kat(100), None, "almond halwa")
R("Rava kesari", "sweet", V, 3, 45, 14, 0.6, kat(100), None, "kesari bath|kesari|sheera (south)")
R("Mysore pak", "sweet", V, 6, 45, 38, 2, n("piece", 30), "1 piece", "mysore paak|mysorepak")
R("Ladoo", "sweet", V, 8, 55, 25, 3, n("ladoo", 35), None, "laddu|besan ladoo|besan laddu|laddoo")
R("Boondi ladoo", "sweet", V, 5, 60, 20, 1.5, n("ladoo", 40), None, "motichoor ladoo|boondi laddu|bundi ladoo", "fried")
R("Rava ladoo", "sweet", V, 5, 58, 20, 1.5, n("ladoo", 35), None, "rava laddu|sooji ladoo")
R("Coconut ladoo", "sweet", V, 4, 50, 25, 5, n("ladoo", 30), None, "nariyal ladoo|thengai ladoo|coconut barfi ball")
R("Til ladoo", "sweet", V, 12, 45, 30, 7, n("ladoo", 25), None, "til ke laddu|ellu urundai|tilkut")
R("Dry fruit ladoo", "sweet", V, 10, 45, 30, 6, n("ladoo", 30), None, "dry fruit laddu|dates ladoo|khajur ladoo")
R("Churma ladoo", "sweet", V, 7, 55, 22, 4, n("ladoo", 40), None, "churma laddu|churma")
R("Atta ladoo", "sweet", V, 8, 50, 28, 4, n("ladoo", 40), None, "pinni|wheat ladoo|gond ladoo")
R("Milk barfi", "sweet", V, 10, 50, 18, 0, n("piece", 30), "1 piece", "burfi|khoya barfi|mawa barfi|barfi")
R("Kaju katli", "sweet", V, 10, 52, 28, 1.5, n("piece", 15, "pieces", (1, 2)), "2 pieces", "kaju barfi|kaju katri|cashew fudge")
R("Coconut barfi", "sweet", V, 5, 55, 22, 5, n("piece", 30), "1 piece", "nariyal barfi|thengai burfi|kopra pak")
R("Peda", "sweet", V, 9, 55, 14, 0, n("peda", 25), None, "pedha|doodh peda|mathura peda|dharwad peda")
R("Kalakand", "sweet", V, 12, 40, 17, 0, n("piece", 40), "1 piece", "milk cake|kalakan")
R("Soan papdi", "sweet", V, 6, 58, 25, 1.5, n("piece", 25), "1 piece", "son papdi|patisa|sohan papdi")
R("Gujiya", "sweet", V, 6, 48, 24, 2, n("gujiya", 40), None, "karanji|gujia|kajjikayalu|nevri|somas", "fried")
R("Malpua", "sweet", V, 5, 45, 17, 1, n("malpua", 50), None, "malpoa|pua", "fried")
R("Shrikhand", "sweet", V, 6, 40, 8, 0, kat(100), None, "amrakhand|kesar shrikhand|matho")
R("Basundi", "sweet", V, 6, 28, 9, 0, kat(100), None, "basundi sweet")
R("Rabri", "sweet", V, 7, 30, 12, 0, kat(100), None, "rabdi|lachha rabri")
R("Kulfi", "sweet", V, 5.5, 26, 10, 0, n("kulfi", 70), None, "malai kulfi|matka kulfi|kulfi stick")
R("Phirni", "sweet", V, 4, 22, 5, 0.3, [("1 cup (matka)", 100)], None, "firni|rice phirni")
R("Modak", "sweet", V, 4, 40, 10, 3, n("modak", 40), None, "ukadiche modak|steamed modak|modakam|kudumu")
R("Puran poli", "sweet", V, 6, 55, 9, 4.5, n("puran poli", 80), None, "holige|obbattu|bobbatlu|poli")
R("Shakarpara", "sweet", V, 6, 60, 20, 2, handful(30), None, "shankarpali|shakkar pare", "fried")
R("Chikki", "sweet", V, 15, 55, 25, 4, n("piece", 20), "1 piece", "peanut chikki|gud chikki|groundnut chikki|kadalai mittai")
R("Gajak", "sweet", V, 9, 60, 20, 4, n("piece", 20), "1 piece", "til gajak|rewari")
R("Balushahi", "sweet", V, 4, 50, 22, 1, n("balushahi", 45), None, "badusha|badushah", "fried")
R("Ghevar", "sweet", V, 4, 50, 25, 1, n("piece", 80), "1 piece", "malai ghevar", "fried")
R("Petha", "sweet", V, 0.4, 85, 0.2, 1, n("piece", 30), "1 piece", "agra petha|ash gourd sweet|angoori petha")
R("Chhena poda", "sweet", V, 10, 35, 12, 0, n("piece", 60), "1 piece", "chenna poda")
R("Double ka meetha", "sweet", V, 6, 40, 15, 1, kat(100), None, "shahi tukda|shahi tukra|bread halwa")
R("Qubani ka meetha", "sweet", V, 1.5, 50, 3, 3, kat(100), None, "khubani ka meetha|apricot dessert")
R("Unniyappam", "sweet", V, 3.5, 45, 12, 2.5, n("unniyappam", 25, None, (2, 4)), "4 unniyappams", "unni appam|nei appam", "fried")
R("Sweet kozhukattai", "sweet", V, 3, 40, 5, 2.5, n("kozhukattai", 40), "2 kozhukattais", "modak (south)|poorna kozhukattai|kadubu")
R("Adhirasam", "sweet", V, 3, 60, 15, 1.5, n("adhirasam", 40), None, "ariselu|anarsa|athirasam", "fried")
R("Sweet pongal", "sweet", V, 3.5, 40, 8, 1.5, kat(), None, "sakkarai pongal|chakkara pongali|jaggery pongal")
R("Falooda", "sweet", V, 4, 24, 6, 0.5, glass(250), None, "faluda|kulfi falooda|royal falooda")
R("Fruit custard", "sweet", V, 3.5, 17, 3.5, 0.8, kat(), None, "custard|fruit custard dessert")
R("Bebinca", "sweet", V, 5, 40, 18, 0.5, n("piece", 60), "1 piece", "bibinca|goan bebinca")
R("Sheera (banana)", "sweet", V, 3, 42, 12, 1.5, kat(100), None, "banana sheera|satyanarayan prasad")
R("Kesar peda", "sweet", V, 9, 56, 13, 0, n("peda", 25), None, "saffron peda")
R("Dharwad peda", "sweet", V, 9, 60, 12, 0, n("peda", 25), None, "dharwad pedha")
R("Lapsi", "sweet", V, 5, 45, 12, 5, kat(100), None, "fada ni lapsi|broken wheat halwa")
R("Kheer kadam", "sweet", V, 8, 45, 12, 0, n("piece", 50), "1 piece", "khirkadam")

# =======================================================================================
# BEVERAGES
# =======================================================================================
R("Masala chai", "beverage", V, 1.6, 7.5, 1.6, 0, cup(155), None, "chai|masala tea|tea with milk and sugar|chaha|chaya")
R("Milk tea", "beverage", V, 1.7, 7, 1.8, 0, cup(155), None, "cutting chai|adrak chai|ginger tea|regular tea|kadak chai")
R("Tea with milk (no sugar)", "beverage", V, 1.5, 2.5, 1.5, 0, cup(155), None, "sugar free chai|chai without sugar|pheeki chai")
R("Lemon tea", "beverage", V, 0, 6, 0, 0, cup(150), None, "nimbu chai|black tea with lemon")
R("Filter coffee", "beverage", V, 2, 8, 2, 0, cup(150), None, "kaapi|south indian coffee|degree coffee|madras coffee")
R("Milk coffee", "beverage", V, 2, 7, 2, 0, cup(155), None, "instant coffee with milk|coffee with milk|hot coffee")
R("Cold coffee", "beverage", V, 3, 12, 3, 0, glass(250), None, "iced coffee|cold coffee shake", "sugary_drink")
R("Lassi", "beverage", V, 2.8, 13, 2.8, 0, glass(250), None, "sweet lassi|punjabi lassi|meethi lassi")
R("Mango lassi", "beverage", V, 2.6, 16, 2.5, 0.3, glass(250), None, "aam lassi")
R("Salted lassi", "beverage", V, 2.8, 4.5, 2.8, 0, glass(250), None, "namkeen lassi|salty lassi|chaas lassi")
R("Buttermilk", "beverage", V, 1.2, 1.8, 0.8, 0, glass(250), None, "chaas|chhachh|mattha|majjige|moru|taak|masala chaas")
R("Badam milk", "beverage", V, 3.5, 13, 3.8, 0.4, glass(250), None, "badam doodh|almond milk (indian)|badam drink")
R("Haldi doodh", "beverage", V, 3.3, 7, 3.5, 0.1, glass(200), None, "turmeric milk|golden milk|haldi milk|turmeric latte")
R("Rose milk", "beverage", V, 3, 13, 3, 0, glass(250), None, "rose milk drink|gulab doodh")
R("Chocolate malt milk", "beverage", V, 3.5, 12, 3.3, 0.3, glass(250), None, "malted milk drink|health drink with milk")
R("Thandai", "beverage", V, 3.5, 15, 5, 0.5, glass(250), None, "sardai|holi thandai")
R("Sugarcane juice", "beverage", V, 0.2, 18, 0.1, 0, glass(250), None, "ganne ka ras|ganna juice|kabbu halu|cherukurasam", "sugary_drink")
R("Nimbu pani", "beverage", V, 0, 8, 0, 0, glass(250), None, "shikanji|lemonade|nimbu sharbat|lemon juice drink", "sugary_drink")
R("Jaljeera", "beverage", V, 0.2, 5, 0.1, 0.2, glass(250), None, "jal jeera|jeera pani", "sugary_drink")
R("Aam panna", "beverage", V, 0.3, 15, 0.1, 0.5, glass(250), None, "aam panha|kairi panna|raw mango drink", "sugary_drink")
R("Kokum sherbet", "beverage", V, 0.2, 14, 0.1, 0.3, glass(250), None, "kokum sharbat|amsul sherbet", "sugary_drink")
R("Rose sherbet", "beverage", V, 0, 12, 0, 0, glass(250), None, "rooh afza|gulab sharbat|rose syrup drink", "sugary_drink")
R("Sol kadhi", "beverage", V, 0.8, 4, 4, 0.5, glass(200), None, "solkadi|kokum coconut drink")
R("Tender coconut water", "beverage", V, 0.7, 4, 0.2, 1.1, [("1 coconut", 300), ("1 glass", 250)], "1 coconut", "nariyal pani|elaneer|ilaneer|daab|coconut water")
R("Fresh lime soda (sweet)", "beverage", V, 0, 9, 0, 0, glass(300), None, "sweet lime soda|nimbu soda sweet", "sugary_drink")
R("Fresh lime soda (salted)", "beverage", V, 0, 0.5, 0, 0, glass(300), None, "salted lime soda|nimbu soda salted")
R("Mosambi juice", "beverage", V, 0.5, 9.5, 0.2, 0.3, glass(250), None, "sweet lime juice|musambi juice|fresh mosambi")
R("Watermelon juice", "beverage", V, 0.6, 8, 0.2, 0.3, glass(250), None, "tarbooz juice|kalingad juice")
R("Mango milkshake", "beverage", V, 3, 15, 3, 0.5, glass(250), None, "mango shake|aam shake")
R("Banana milkshake", "beverage", V, 3.2, 15, 3, 0.6, glass(250), None, "banana shake|kela shake")
R("Chikoo milkshake", "beverage", V, 3, 17, 3, 1.5, glass(250), None, "chiku shake|sapota milkshake")
R("Ragi malt", "beverage", V, 2, 12, 1.5, 1.5, glass(250), None, "ragi java|ragi ambali|ragi porridge drink|ragi kanji")
R("Sattu drink", "beverage", V, 5, 17, 1.5, 4, glass(250), None, "sattu sharbat|sattu ghol")
R("Kahwa", "beverage", V, 0.1, 4, 0, 0, cup(150), None, "kashmiri kahwa|qahwa")
R("Kanji (carrot drink)", "beverage", V, 0.4, 3, 0, 0.6, glass(200), None, "black carrot kanji|gajar kanji")
R("Paneer soda", "beverage", V, 0, 10, 0, 0, glass(250), None, "goli soda|panneer soda|banta", "sugary_drink|-dairy")
R("Masala soda", "beverage", V, 0, 8, 0, 0, glass(250), None, "masala shikanji soda|jeera soda", "sugary_drink")

# =======================================================================================
# CHUTNEYS, PICKLES, CONDIMENTS, FATS
# =======================================================================================
R("Coconut chutney", "condiment", V, 2.5, 8, 16, 4.5, [("1 tbsp", 15), ("2 tbsp", 30), ("1 small katori", 50)], "2 tbsp", "thengai chutney|kobbari pachadi|nariyal chutney|white chutney")
R("Tomato chutney", "condiment", V, 2, 12, 6, 2.5, [("1 tbsp", 15), ("2 tbsp", 30), ("1 small katori", 50)], "2 tbsp", "thakkali chutney|tomato pachadi|red chutney")
R("Peanut chutney", "condiment", V, 9, 14, 20, 4.5, [("1 tbsp", 15), ("2 tbsp", 30), ("1 small katori", 50)], "2 tbsp", "palli chutney|groundnut chutney|shenga chutney|kadalai chutney")
R("Mint chutney", "condiment", V, 2.5, 8, 1, 3, [("1 tbsp", 15), ("2 tbsp", 30)], "1 tbsp", "green chutney|hari chutney|pudina chutney|dhania chutney")
R("Tamarind chutney", "condiment", V, 0.8, 55, 0.2, 2.5, [("1 tbsp", 20), ("2 tbsp", 40)], "1 tbsp", "imli chutney|saunth|meethi chutney|sweet chutney")
R("Onion chutney", "condiment", V, 1.5, 12, 7, 2, [("1 tbsp", 15), ("2 tbsp", 30)], "2 tbsp", "vengaya chutney|ulli chutney")
R("Gunpowder podi", "condiment", V, 18, 42, 18, 12, [("1 tbsp", 10), ("2 tbsp", 20)], "1 tbsp", "idli podi|milagai podi|chutney pudi|gun powder")
R("Garlic chutney", "condiment", V, 8, 30, 30, 8, [("1 tsp", 5), ("1 tbsp", 12)], "1 tsp", "lehsun chutney|vada pav chutney|dry garlic chutney")
R("Mango pickle", "condiment", V, 1, 8, 15, 2.5, [("1 tsp", 8), ("1 tbsp", 20)], "1 tsp", "aam ka achar|avakaya|mangai oorugai|kairi achar")
R("Lime pickle", "condiment", V, 1, 10, 10, 3, [("1 tsp", 8), ("1 tbsp", 20)], "1 tsp", "nimbu ka achar|lemon pickle|narthangai oorugai")
R("Mixed pickle", "condiment", V, 1.2, 8, 14, 3, [("1 tsp", 8), ("1 tbsp", 20)], "1 tsp", "mix achar|mixed achar")
R("Gongura pickle", "condiment", V, 2, 9, 18, 4, [("1 tsp", 8), ("1 tbsp", 20)], "1 tsp", "gongura pachadi|pulicha keerai thokku")
R("Gulkand", "condiment", V, 0.5, 70, 0.1, 1, [("1 tsp", 8), ("1 tbsp", 20)], "1 tsp", "rose petal jam")
R("Jaggery", "condiment", V, 0.4, 95, 0.1, 0.6, [("1 tsp", 5), ("1 piece", 10), ("1 tbsp", 15)], "1 piece", "gur|gud|bellam|vellam|sharkara|panela")
R("Ghee", "fat_oil", V, 0, 0, 99.5, 0, [("1 tsp", 5), ("1 tbsp", 14)], "1 tsp", "clarified butter|desi ghee|neyyi|tuppa|nei")
R("White butter", "fat_oil", V, 0.5, 0.5, 80, 0, [("1 tsp", 5), ("1 tbsp", 14)], "1 tbsp", "makkhan|safed makhan|homemade butter|benne|vennai")
R("Cooking oil", "fat_oil", V, 0, 0, 100, 0, [("1 tsp", 4.5), ("1 tbsp", 13.5)], "1 tsp", "refined oil|tel|vegetable oil|sunflower oil|groundnut oil|mustard oil")
R("Malai", "dairy", V, 2.5, 3.5, 40, 0, [("1 tbsp", 15)], None, "milk cream|dairy cream|cream from milk|meethi malai")
R("Tadka (ghee + spices)", "fat_oil", V, 0.5, 2, 90, 1, [("1 tsp", 5), ("1 tbsp", 14)], "1 tsp", "tempering|chhonk|baghar|oggarane")

# =======================================================================================
# DAIRY
# =======================================================================================
R("Plain curd", "dairy", V, 3.3, 4.7, 3.4, 0, kat(100), None, "dahi|curd|yogurt|thayir|mosaru|perugu|doi")
R("Low fat curd", "dairy", V, 3.5, 4.8, 1.5, 0, kat(100), None, "toned milk curd|skimmed dahi|low fat dahi")
R("Hung curd", "dairy", V, 7, 5, 6, 0, kat(100), None, "chakka|greek yogurt (desi)|strained curd")
R("Raita", "dairy", V, 3, 5, 3, 0.5, kat(100), None, "onion raita|mix raita|pachadi|thayir pachadi")
R("Boondi raita", "dairy", V, 3.5, 9, 5, 0.6, kat(100), None, "bundi raita")
R("Cucumber raita", "dairy", V, 2.8, 4.5, 2.8, 0.4, kat(100), None, "kheere ka raita|vellarikka pachadi")
R("Khoa", "dairy", V, 14.6, 20.5, 31.2, 0, [("1 tbsp", 15), ("1 katori", 100)], "1 tbsp", "mawa|khoya|khova")
R("Chhena", "dairy", V, 17, 1.5, 20, 0, [("1 katori", 100)], None, "chena|chhana|fresh paneer crumbled")
R("Full cream milk", "dairy", V, 3.2, 4.8, 6, 0, glass(250), None, "doodh|whole milk|full fat milk|milk")
R("Toned milk", "dairy", V, 3.1, 4.7, 3, 0, glass(250), None, "toned doodh|3% milk")
R("Double toned milk", "dairy", V, 3, 4.7, 1.5, 0, glass(250), None, "double toned doodh|1.5% milk")
R("Buffalo milk", "dairy", V, 4.3, 5, 6.5, 0, glass(250), None, "bhains ka doodh|emme haalu|erumai paal")
R("Cow milk", "dairy", V, 3.2, 4.4, 4.1, 0, glass(250), None, "gai ka doodh|desi cow milk|pasu paal")
R("Cheese slice", "dairy", V, 18, 6, 24, 0, n("slice", 20), None, "processed cheese|cheese singles")

# =======================================================================================
# FRUITS
# =======================================================================================
R("Banana", "fruit", V, 1.1, 22.8, 0.3, 2.6, [("1 banana", 110), ("1 small banana", 80)], None, "kela|keli|vazhaipazham|arati pandu|kolla|elaichi banana")
R("Apple", "fruit", V, 0.3, 13.8, 0.2, 2.4, [("1 apple", 180), ("1 small apple", 120)], None, "seb|safarchand|sev")
R("Mango", "fruit", V, 0.8, 15, 0.4, 1.6, [("1 mango", 200), ("1 cup, sliced", 165)], None, "aam|alphonso|mambazham|mamidi pandu|hapus|kesar mango|langda")
R("Papaya", "fruit", V, 0.5, 10.8, 0.3, 1.7, [("1 cup, cubed", 145), ("1 slice", 100)], None, "papita|pappali|boppayi|parangi")
R("Chikoo", "fruit", V, 0.4, 20, 1.1, 5.3, n("chikoo", 80), None, "chiku|sapota|sapodilla|sapota pazham")
R("Guava", "fruit", V, 2.6, 14.3, 1, 5.4, n("guava", 100), None, "amrood|peru|koyya|jamakaya|pera")
R("Orange", "fruit", V, 0.9, 11.8, 0.1, 2.4, n("orange", 130), None, "santra|narangi|kamala|kinnow")
R("Mosambi", "fruit", V, 0.8, 9.3, 0.3, 1.7, n("mosambi", 150), None, "sweet lime|musambi|sathukudi|battayi")
R("Pomegranate", "fruit", V, 1.7, 18.7, 1.2, 4, [("1 cup, arils", 175), ("1/2 cup, arils", 87)], "1 cup, arils", "anar|anardana (fresh)|mathulai|danimma")
R("Grapes", "fruit", V, 0.7, 18, 0.2, 0.9, [("1 cup", 150), ("10 grapes", 50)], None, "angoor|draksha|thiratchai")
R("Watermelon", "fruit", V, 0.6, 7.6, 0.2, 0.4, [("1 cup, diced", 150), ("1 slice", 280)], None, "tarbooz|kalingad|tarbuj|darbuja")
R("Muskmelon", "fruit", V, 0.8, 8.2, 0.2, 0.9, [("1 cup, diced", 160), ("1 slice", 150)], None, "kharbooja|kharbuja|cantaloupe|mulam pazham")
R("Pineapple", "fruit", V, 0.5, 13, 0.1, 1.4, [("1 cup, chunks", 165), ("1 slice", 85)], None, "ananas|annasi pazham")
R("Jackfruit", "fruit", V, 1.7, 23, 0.6, 1.5, [("5 bulbs", 100), ("1 cup, bulbs", 165)], None, "kathal|chakka|palapazham|panasa")
R("Litchi", "fruit", V, 0.8, 16.5, 0.4, 1.3, [("10 litchis", 100), ("5 litchis", 50)], None, "lychee|lichi")
R("Jamun", "fruit", V, 0.7, 15.5, 0.2, 0.6, [("10 jamuns", 60), ("1 cup", 135)], None, "java plum|black plum|naval pazham|neredu")
R("Custard apple", "fruit", V, 2.1, 23.6, 0.3, 4.4, n("sitaphal (edible pulp)", 100), None, "sitaphal|sharifa|seethapazham|ramphal")
R("Amla", "fruit", V, 0.5, 13.7, 0.1, 3.4, n("amla", 30), None, "indian gooseberry|nellikai|usiri|amlaki|avla")
R("Ber", "fruit", V, 0.8, 17, 0.1, 1, [("10 ber", 100)], None, "jujube|bor|elandha pazham|regi pandu")
R("Raw mango", "fruit", V, 0.7, 10.1, 0.1, 1.2, [("1 raw mango", 150)], None, "kairi|kacha aam|mangai|mamidikaya")
R("Bael fruit", "fruit", V, 1.8, 31.8, 0.3, 2.9, [("1 cup, pulp", 100)], None, "bael|bel|stone apple|vilvam")
R("Pear", "fruit", V, 0.4, 15, 0.1, 3.1, n("pear", 170), None, "nashpati|naspati|babugosha")
R("Plum", "fruit", V, 0.7, 11.4, 0.3, 1.4, n("plum", 65), None, "aloo bukhara|alubukhara")
R("Peach", "fruit", V, 0.9, 9.5, 0.3, 1.5, n("peach", 150), None, "aadu|aaru")
R("Strawberries", "fruit", V, 0.7, 7.7, 0.3, 2, [("1 cup", 150), ("5 strawberries", 60)], None, "strawberry")
R("Kiwi", "fruit", V, 1.1, 14.7, 0.5, 3, n("kiwi", 75), None, "kiwi fruit")
R("Fig", "fruit", V, 0.8, 19.2, 0.3, 2.9, n("fig", 50), None, "anjeer (fresh)|anjir|athi pazham")
R("Dates", "fruit", V, 2.5, 75, 0.4, 7, [("1 date", 8), ("3 dates", 24)], "3 dates", "khajoor|khajur|pind khajur|dry dates|perichampazham")
R("Raisins", "fruit", V, 3, 79, 0.5, 3.7, [("1 tbsp", 10), ("1 handful", 30)], "1 tbsp", "kishmish|munakka|drakshi|ullar thiratchai")
R("Dried figs", "fruit", V, 3.3, 64, 0.9, 9.8, n("anjeer", 20, "anjeers"), "2 anjeers", "anjeer|anjir|dry fig")
R("Dried apricots", "fruit", V, 3.4, 63, 0.5, 7.3, n("apricot", 8, None, (1, 5)), "5 apricots", "khubani|khumani|jardalu")
R("Fruit chaat", "fruit", V, 0.8, 17, 0.3, 2.2, bowl(200), None, "fruit salad|chaat masala fruits")
R("Tender coconut malai", "fruit", V, 1.5, 6, 4, 1.5, [("1 coconut", 60)], None, "nariyal malai|elaneer vazhukkai|coconut flesh (tender)")
R("Coconut (fresh, grated)", "nut_seed", V, 3.3, 15.2, 33.5, 9, [("1 tbsp", 8), ("1/2 cup", 40)], "1 tbsp", "nariyal|thengai|kobbari|grated coconut|kopra (fresh)")
R("Dry coconut", "nut_seed", V, 7, 24, 64, 16, [("1 tbsp, grated", 6), ("1 piece", 20)], "1 tbsp, grated", "kopra|khopra|copra|sukha nariyal|kobbari")

# =======================================================================================
# VEGETABLES (raw)
# =======================================================================================
R("Tinda", "vegetable", V, 1.4, 3.4, 0.2, 1, [("1 tinda", 50)], None, "round gourd|tinda gourd|dhemse")
R("Parwal", "vegetable", V, 2, 5.2, 0.3, 3, n("parwal", 25, None, (1, 4)), "4 parwals", "pointed gourd|potol|parval|kovakkai (pointed gourd)")
R("Tindora", "vegetable", V, 1.2, 3.1, 0.1, 1.6, [("1 cup", 100)], None, "ivy gourd|kundru|dondakaya|kovakkai|tondli")
R("Methi leaves", "vegetable", V, 4.4, 10, 0.9, 4.9, [("1 cup", 35), ("1 bunch", 100)], "1 cup", "fenugreek leaves|methi|menthya soppu|vendhaya keerai")
R("Curry leaves", "vegetable", V, 6.1, 18.7, 1, 6.4, [("10 leaves", 2), ("1 sprig", 5)], "1 sprig", "kadi patta|karivepaku|kariveppila|kadipatta")
R("Snake gourd", "vegetable", V, 0.5, 3.3, 0.3, 0.8, [("1 cup, chopped", 100)], None, "chichinda|padwal|pudalangai|potlakaya")
R("Cluster beans", "vegetable", V, 3.2, 10.8, 0.4, 3.2, [("1 cup, chopped", 100)], None, "gavar|gawar|guar phali|kothavarangai|goruchikkudu")
R("Banana flower", "vegetable", V, 1.6, 7, 0.6, 4, [("1 cup, chopped", 100)], None, "mocha|vazhaipoo|kele ka phool|arati puvvu")
R("Elephant foot yam", "vegetable", V, 1.2, 18.4, 0.1, 0.8, [("1 cup, cubed", 130)], None, "suran|jimikand|senai|oal|kanda (yam)")
R("Raw papaya", "vegetable", V, 0.7, 5.7, 0.2, 0.9, [("1 cup, grated", 100)], None, "kacha papita|papaya (green)|pappali kaai")
R("Flat beans", "vegetable", V, 3.8, 6.7, 0.7, 1.8, [("1 cup, chopped", 100)], None, "sem|sem phali|avarekai|avarakkai|papdi|val papdi")
R("Drumstick leaves", "vegetable", V, 6.7, 12.5, 1.7, 0.9, [("1 cup", 25)], None, "moringa leaves|murungai keerai|sahjan patta|nugge soppu")
R("Kachumber salad", "salad", V, 1, 5, 0.2, 1.5, kat(100), None, "kachumbar|cucumber tomato onion salad|kosambari (no dal)")
R("Laccha pyaz", "salad", V, 1.1, 9, 0.1, 1.7, kat(50), None, "onion salad|sirke wala pyaz|onion rings salad")
R("Koshimbir", "salad", V, 1.5, 5, 3, 1.5, kat(100), None, "kosimbir|koshambir")
R("Kosambari", "salad", V, 5, 11, 2.5, 3, kat(100), None, "moong dal kosambari|cucumber kosambari")
R("Moong sprouts salad", "salad", V, 4.5, 10, 1.2, 3, bowl(150), None, "sprouts salad|ankurit moong salad")
R("Green salad", "salad", V, 1, 4.5, 0.2, 1.6, plate(150), None, "salad|cucumber carrot salad|mixed green salad")

# =======================================================================================
# NUTS & SEEDS
# =======================================================================================
R("Almonds", "nut_seed", V, 21.2, 21.6, 49.9, 12.5, [("5 almonds", 6), ("10 almonds", 12), ("1 handful", 30)], "10 almonds", "badam|badaam|almond")
R("Peanuts", "nut_seed", V, 25.8, 16.1, 49.2, 8.5, [("1 handful", 30), ("1 tbsp", 9)], "1 handful", "moongphali|groundnut|mungfali|shenga|kadalai|verusenaga")
R("Roasted peanuts", "nut_seed", V, 26, 18, 50, 8, [("1 handful", 30)], None, "bhuni moongphali|roasted groundnut|shenga (roasted)")
R("Boiled peanuts", "nut_seed", V, 13.5, 21, 22, 8.8, [("1 cup", 65)], None, "ubli moongphali|boiled groundnut|verkadalai (boiled)")
R("Cashews", "nut_seed", V, 18.2, 30.2, 43.9, 3.3, [("5 cashews", 8), ("10 cashews", 16), ("1 handful", 30)], "10 cashews", "kaju|cashew nuts|mundiri|jeedi pappu|godambi")
R("Walnuts", "nut_seed", V, 15.2, 13.7, 65.2, 6.7, [("2 walnuts (4 halves)", 8), ("1 handful", 30)], "2 walnuts (4 halves)", "akhrot|walnut kernels")
R("Pistachios", "nut_seed", V, 20.2, 27.2, 45.3, 10.6, [("10 pistachios", 7), ("1 handful", 30)], "10 pistachios", "pista|pistachio nuts")
R("Chironji", "nut_seed", V, 19, 12.1, 59.1, 3.8, [("1 tsp", 3), ("1 tbsp", 9)], "1 tbsp", "charoli|chirauli|sara paruppu")
R("Flax seeds", "nut_seed", V, 18.3, 28.9, 42.2, 27.3, [("1 tbsp", 10), ("1 tsp", 3.5)], "1 tbsp", "alsi|jawas|agase|ali vidai|linseed")
R("Sesame seeds", "nut_seed", V, 17.7, 23.4, 49.7, 11.8, [("1 tbsp", 9), ("1 tsp", 3)], "1 tbsp", "til|ellu|nuvvulu|gingelly seeds")
R("Sunflower seeds", "nut_seed", V, 20.8, 20, 51.5, 8.6, [("1 tbsp", 9), ("1 handful", 30)], "1 tbsp", "surajmukhi beej|sunflower kernels")
R("Pumpkin seeds", "nut_seed", V, 30.2, 10.7, 49, 6, [("1 tbsp", 9), ("1 handful", 30)], "1 tbsp", "kaddu ke beej|pepitas|magaj (pumpkin)")
R("Mixed dry fruits", "nut_seed", V, 15, 35, 40, 6, [("1 handful", 30)], None, "dry fruits|dry fruit mix|mewa|trail mix")

# =======================================================================================
# GRAINS, FLOURS & PULSES (raw)
# =======================================================================================
R("Atta", "grain", V, 12, 71, 1.7, 11, [("1 cup", 120), ("1 tbsp", 8)], "1 cup", "whole wheat flour|gehun ka atta|chakki atta|godhuma pindi")
R("Maida", "grain", V, 10.3, 76, 1, 2.7, [("1 cup", 125), ("1 tbsp", 8)], "1 cup", "refined flour|all purpose flour|maida flour")
R("Besan", "grain", V, 22, 58, 5.6, 10.8, [("1 cup", 90), ("1 tbsp", 7)], "1 tbsp", "gram flour|chickpea flour|kadalai maavu|senaga pindi")
R("Sooji", "grain", V, 12.7, 72.8, 1.1, 3.9, [("1 cup", 170), ("1 tbsp", 11)], "1 tbsp", "semolina|rava|suji|bombay rava|upma rava")
R("Ragi flour", "grain", V, 7.2, 72, 1.9, 11.2, [("1 cup", 120), ("1 tbsp", 8)], "1 cup", "finger millet flour|nachni atta|ragi|keppai maavu|nagli")
R("Jowar flour", "grain", V, 10.4, 72.6, 1.9, 9.7, [("1 cup", 120), ("1 tbsp", 8)], "1 cup", "sorghum flour|jowar atta|jola hittu|cholam maavu")
R("Bajra flour", "grain", V, 11.6, 67.5, 5, 11.5, [("1 cup", 120), ("1 tbsp", 8)], "1 cup", "pearl millet flour|bajra atta|sajje hittu|kambu maavu")
R("Makki ka atta", "grain", V, 9, 73, 4, 7.3, [("1 cup", 120), ("1 tbsp", 8)], "1 cup", "maize flour|corn flour (maize)|makai atta")
R("Rice flour", "grain", V, 6, 80, 0.5, 2.4, [("1 cup", 160), ("1 tbsp", 10)], "1 cup", "chawal ka atta|akki hittu|arisi maavu|biyyam pindi")
R("Basmati rice (raw)", "grain", V, 7.1, 78, 0.6, 1.3, [("1 cup", 185), ("1/4 cup", 46)], "1/4 cup", "basmati|raw basmati|chawal (uncooked)")
R("Sona masoori rice (raw)", "grain", V, 7, 79, 0.5, 1, [("1 cup", 190), ("1/4 cup", 48)], "1/4 cup", "sona masuri|ponni rice|raw rice|kolam rice")
R("Poha (raw flakes)", "grain", V, 6.6, 77, 1.2, 2.5, [("1 cup", 70), ("1 handful", 25)], "1 cup", "flattened rice|beaten rice|aval|avalakki|chuda|atukulu")
R("Sabudana", "grain", V, 0.2, 87, 0.2, 0.9, [("1 cup", 150), ("1 tbsp", 12)], "1 cup", "sago|tapioca pearls|javvarisi|saggubiyyam")
R("Dalia (raw)", "grain", V, 11.8, 70, 1.5, 12.5, [("1 cup", 140), ("1/4 cup", 35)], "1/4 cup", "broken wheat|daliya|godhuma rava|lapsi rava|bulgur")
R("Foxtail millet", "grain", V, 12.3, 60.9, 4.3, 8, [("1/4 cup", 45)], None, "kangni|thinai|navane|korralu|kakum")
R("Little millet", "grain", V, 7.7, 67, 4.7, 7.6, [("1/4 cup", 45)], None, "kutki|samai|saame|sama")
R("Kodo millet", "grain", V, 8.3, 65.6, 1.4, 9, [("1/4 cup", 45)], None, "kodra|varagu|harka|arikelu")
R("Barnyard millet", "grain", V, 6.2, 65.5, 2.2, 9.8, [("1/4 cup", 45)], None, "sanwa|samak ke chawal|kuthiraivali|oodalu|vrat rice")
R("Sattu", "grain", V, 21, 60, 5.5, 11, [("1 tbsp", 10), ("1/4 cup", 30)], "1/4 cup", "sattu atta|chana sattu|roasted gram flour")
R("Toor dal (raw)", "legume", V, 22.3, 57.6, 1.7, 9, [("1/4 cup", 50), ("1 cup", 200)], "1/4 cup", "arhar dal raw|tuvar dal|kandi pappu|thuvaram paruppu")
R("Moong dal (raw)", "legume", V, 24.5, 59.9, 1.2, 8.2, [("1/4 cup", 50), ("1 cup", 200)], "1/4 cup", "yellow moong dal|split moong|pesara pappu|pasi paruppu")
R("Masoor dal (raw)", "legume", V, 24.6, 60, 1.1, 10.7, [("1/4 cup", 50), ("1 cup", 200)], "1/4 cup", "red lentils|masoor|mysore dal")
R("Chana dal (raw)", "legume", V, 20.8, 59.8, 5.6, 15, [("1/4 cup", 50), ("1 cup", 200)], "1/4 cup", "bengal gram dal|kadalai paruppu|senaga pappu")
R("Urad dal (raw)", "legume", V, 24, 59.6, 1.4, 11.9, [("1/4 cup", 50), ("1 cup", 200)], "1/4 cup", "black gram dal|ulundu|minapa pappu|uddina bele")
R("Rajma (raw)", "legume", V, 22.9, 60.6, 1.3, 16.6, [("1/4 cup", 45), ("1 cup", 185)], "1/4 cup", "raw kidney beans|dry rajma")
R("Kabuli chana (raw)", "legume", V, 19.3, 60.6, 6, 15, [("1/4 cup", 45), ("1 cup", 200)], "1/4 cup", "dry chickpeas|chole (raw)|safed chana|kondakadalai")
R("Kala chana (raw)", "legume", V, 20, 60, 5, 17, [("1/4 cup", 45), ("1 cup", 200)], "1/4 cup", "black chickpeas|desi chana|kadala|bengal gram whole")
R("Moong (whole, raw)", "legume", V, 23.9, 62.6, 1.2, 16.3, [("1/4 cup", 50)], None, "sabut moong|green gram|hesaru kalu|pachai payaru")
R("Soya chunks", "legume", V, 52, 33, 0.5, 13, [("1/4 cup (dry)", 25), ("1 cup (dry)", 50)], "1/4 cup (dry)", "meal maker|nutrela|soy chunks|soya badi|tvp")
R("Horse gram (raw)", "legume", V, 22, 57, 0.5, 8, [("1/4 cup", 50)], None, "kulthi|kollu|ulavalu|hurali")
R("Moth beans (raw)", "legume", V, 23.6, 61.5, 1.6, 10.8, [("1/4 cup", 50)], None, "matki|moth|mataki|madki")
R("Lobia (raw)", "legume", V, 23.5, 60, 1.3, 11, [("1/4 cup", 45)], None, "black eyed beans|chawli|karamani|alasande")
R("Moong sprouts", "legume", V, 3, 6, 0.2, 1.8, [("1 cup", 105), ("1 katori", 100)], "1 cup", "sprouted moong|ankurit moong|mung bean sprouts|sprouts")

# =======================================================================================
# SOUPS
# =======================================================================================
R("Rasam", "soup", V, 1, 4.5, 1.2, 0.6, kat(), None, "saaru|chaaru|pepper rasam|tomato rasam|charu")
R("Tomato shorba", "soup", V, 1.2, 8, 2.5, 1, bowl(250), None, "tomato soup (indian)|tamatar shorba")
R("Manchow soup", "soup", V, 2, 6, 2, 1, bowl(250), None, "veg manchow soup", "fast_food")
R("Sweet corn soup", "soup", V, 1.8, 9, 1.5, 0.8, bowl(250), None, "veg sweet corn soup|corn soup")
R("Chicken soup", "soup", NV, 4, 2, 1.5, 0.3, bowl(250), None, "chicken yakhni|chicken shorba|chicken clear soup")
R("Mutton paya soup", "soup", NV, 6, 2, 5, 0.2, bowl(250), None, "paya|paya shorba|aattukaal soup|trotters soup")
R("Mulligatawny soup", "soup", V, 3, 7, 3, 1.5, bowl(250), None, "mulligatawny|milagu thanni")
R("Lemon coriander soup", "soup", V, 1.2, 4, 1, 0.8, bowl(250), None, "lemon coriander soup")
R("Palak soup", "soup", V, 1.8, 4, 1.8, 1.3, bowl(250), None, "spinach soup")
R("Dal soup", "soup", V, 3.5, 8, 1, 1.5, bowl(250), None, "lentil soup|dal shorba")
R("Chicken sweet corn soup", "soup", NV, 3, 8, 1.5, 0.6, bowl(250), None, "chicken corn soup")
R("Veg clear soup", "soup", V, 0.8, 3.5, 0.5, 0.8, bowl(250), None, "clear vegetable soup")


# =======================================================================================
# build
# =======================================================================================
KEYWORD_TAGS = [
    ("meat", r"chicken|mutton|lamb|goat|keema|gosht|rogan|nihari|haleem|laal maas|kebab|kabab|paya|mangsho|shawarma|chops"),
    ("seafood", r"fish|prawn|shrimp|crab|machh|maach|meen|ilish|hilsa|pomfret|bangda|surmai|chingri|rohu|katla|bombil"),
    ("egg", r"\begg|anda|omelette"),
    ("dairy", r"paneer|curd|dahi|raita|lassi|buttermilk|milk|doodh|shrikhand|rabri|basundi|kulfi|khoa|chhena|malai|kheer|payasam|rasgulla|rasmalai|sandesh|cham cham|mishti doi|peda|barfi|kalakand|phirni|thandai|falooda|custard|cheese|kadhi"),
    ("legume", r"\bdal\b|dal |chana|chole|rajma|moong|lobia|sprouts|sundal|usal|misal|ghugni|kulthi|matki|pesarattu|\badai\b|chilla|dhokla|khandvi|handvo|sambar|pappu|dalma|amti|sattu|soya|ragda|kootu|kosambari|horse gram|moth|pithla|gatte|besan|urad|masoor|toor|medu vada|masala vada|dahi vada|sambar vada"),
    ("grain", r"idli|dosa|uttapam|upma|poha|appam|idiyappam|puttu|pongal|roti|paratha|naan|kulcha|poori|bhatura|luchi|thepla|bhakri|parotta|pav\b|baati|litti|rice|biryani|pulao|khichdi|bath|noodles|chowmein|pasta|sevai|daliya|dalia|oats|ragi|jowar|bajra|millet|atta|maida|sooji|flour|sabudana|chapati|phulka|mudde|paniyaram|kozhukattai|thalipeeth|sandwich|burger|pizza|bun|rusk|biscuit|khakhra|cornflakes|murmura|chivda|chopsuey|bread|thali|meals"),
    ("vegetable", r"sabzi|\baloo\b|bhaji\b|gobi|bhindi|baingan|palak|saag|matar|mushroom|lauki|turai|tinda|parwal|kaddu|arbi|kathal|karela|beans|cabbage|beetroot|thoran|avial|olan|erissery|undhiyu|shukto|posto|potol|mochar|veg |veg$|kurma|veg stew|tindora|gavar|suran|banana fry|corn palak|methi|sarson|salad|kachumber|koshimbir|mirchi|jalfrezi|kolhapuri|kofta|navratan|ker sangri|tamatar|bharta|vangi"),
]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def r1(x):
    v = round(float(x) + 1e-9, 1)
    return int(v) if v == int(v) else v


def build_row(d):
    p, c, f, fib = d["p"], d["c"], d["f"], d["fib"]
    assert fib <= c, d["name"]
    kcal = 4 * p + 4 * (c - fib) + 2 * fib + 9 * f
    cat = d["cat"]
    assert cat in CATEGORIES, (d["name"], cat)
    tags = [t for t in d["tags"].split("|") if t]
    neg = [t for t in tags if t.startswith("-")]
    tags = [t for t in tags if not t.startswith("-")]
    base = {"sweet": ["dessert"], "street_food": ["street_food"], "beverage": ["beverage"],
            "dairy": ["dairy"], "fruit": ["fruit"], "vegetable": ["vegetable"], "legume": ["legume"],
            "dal": ["legume"], "meat": ["meat"], "seafood": ["seafood"], "egg": ["egg"],
            "grain": ["grain"], "rice": ["grain"], "bread": ["grain"], "snack": ["snack"],
            "salad": ["vegetable"]}.get(cat, [])
    tags = base + tags
    lname = d["name"].lower()
    if cat in ("curry", "main", "breakfast", "snack", "street_food", "rice", "bread", "soup", "sweet", "beverage", "egg", "meat", "seafood"):
        for tag, rx in KEYWORD_TAGS:
            if tag in ("meat", "seafood", "egg") and d["veg"]:
                continue
            if re.search(rx, lname):
                tags.append(tag)
    tags += neg
    if cat in ("curry",) and d["veg"] and not any(t in tags for t in ("dairy", "legume", "vegetable")):
        tags.append("vegetable")
    if kcal > 0 and (p >= 20 or 4 * p / kcal >= 0.30):
        tags.append("high_protein")
    if fib >= 6:
        tags.append("high_fibre")
    removed = {t[1:] for t in tags if t.startswith("-")}
    tags = [t for t in dict.fromkeys(tags) if not t.startswith("-") and t not in removed]
    for t in tags:
        assert t in TAGS, (d["name"], t)

    opts = []
    for label, g in d["sv"]:
        g = r1(g)
        if label == "100 g":
            continue
        opts.append({"label": label, "grams": g})
    opts.append({"label": "100 g", "grams": 100})
    labels = [o["label"] for o in opts]
    assert len(labels) == len(set(labels)), d["name"]
    default = d["default"] or labels[0]
    if default not in labels:
        # e.g. default "3 pooris" with only "1 poori" defined -> add the multiple
        m = re.match(r"^(\d+) ", default)
        one = next((o for o in opts if o["label"].startswith("1 ")), None)
        assert m and one, (d["name"], default, labels)
        opts.insert(len(opts) - 1, {"label": default, "grams": r1(one["grams"] * int(m.group(1)))})
        labels = [o["label"] for o in opts]
    aliases = [a.strip() for a in d["al"].split("|") if a.strip() and a.strip().lower() != lname]
    return {
        "external_id": "in-" + slug(d["name"]),
        "name": d["name"],
        "aliases": "|".join(dict.fromkeys(aliases)),
        "category": cat,
        "tags": "|".join(tags),
        "veg": "true" if d["veg"] else "false",
        "kcal": int(round(kcal)), "protein": r1(p), "carbs": r1(c), "fat": r1(f), "fibre": r1(fib),
        "serving_options": json.dumps(opts, ensure_ascii=False, separators=(",", ":")),
        "default_serving": default,
    }


def main():
    rows = [build_row(d) for d in ROWS]
    seen_names, seen_ids = set(), set()
    for r in rows:
        assert r["name"].lower() not in seen_names, f"duplicate name {r['name']}"
        assert r["external_id"] not in seen_ids, f"duplicate id {r['external_id']}"
        seen_names.add(r["name"].lower())
        seen_ids.add(r["external_id"])
    rows.sort(key=lambda r: (r["category"], r["name"].lower()))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {os.path.relpath(OUT)}")


if __name__ == "__main__":
    main()
