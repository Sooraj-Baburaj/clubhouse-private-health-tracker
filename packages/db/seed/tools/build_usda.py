#!/usr/bin/env python3
"""Build packages/db/seed/foods/usda_generic.csv from USDA FoodData Central SR Legacy.

Usage:  python3 packages/db/seed/tools/build_usda.py

Downloads the SR Legacy CSV release into tools/.cache/ (only if not already
cached), selects ~1,500 common generic foods, rewrites USDA descriptions into
short friendly names, derives household serving options from food_portion.csv
and writes the CSV. Output is deterministic (sorted, no randomness).

Only the Python standard library is used.
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
import urllib.request
import zipfile
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, ".cache")
OUT = os.path.join(HERE, "..", "foods", "usda_generic.csv")
URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip"
ZIP = os.path.join(CACHE, "FoodData_Central_sr_legacy_food_csv_2018-04.zip")
DIR = os.path.join(CACHE, "FoodData_Central_sr_legacy_food_csv_2018-04")

HEADER = ["external_id", "name", "aliases", "category", "tags", "veg", "kcal", "protein",
          "carbs", "fat", "fibre", "serving_options", "default_serving"]

N_KCAL, N_KCAL_GEN, N_KCAL_SPEC = "1008", "2047", "2048"
N_PROT, N_FAT, N_CARB, N_FIBRE, N_SUGAR, N_ALC = "1003", "1004", "1005", "1079", "2000", "1018"


# --------------------------------------------------------------------------------------
# download / load
# --------------------------------------------------------------------------------------
def ensure_data() -> None:
    os.makedirs(CACHE, exist_ok=True)
    gi = os.path.join(CACHE, ".gitignore")
    if not os.path.exists(gi):
        with open(gi, "w") as f:
            f.write("*\n")
    if os.path.exists(os.path.join(DIR, "food.csv")):
        return
    if not os.path.exists(ZIP):
        print(f"Downloading {URL} ...", file=sys.stderr)
        urllib.request.urlretrieve(URL, ZIP + ".part")
        os.replace(ZIP + ".part", ZIP)
    with zipfile.ZipFile(ZIP) as z:
        z.extractall(CACHE)


def read(name):
    with open(os.path.join(DIR, name), newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)


# --------------------------------------------------------------------------------------
# selection rules
# --------------------------------------------------------------------------------------
# USDA food_category_id -> (our category, max rows kept)
CATS = {
    "1": ("dairy", 95), "2": ("condiment", 45), "4": ("fat_oil", 40), "5": ("meat", 70),
    "6": ("soup", 70), "7": ("meat", 22), "8": ("breakfast", 30), "9": ("fruit", 175),
    "10": ("meat", 32), "11": ("vegetable", 300), "12": ("nut_seed", 60), "13": ("meat", 50),
    "14": ("beverage", 70), "15": ("seafood", 118), "16": ("legume", 95), "17": ("meat", 30),
    "18": ("bread", 150), "19": ("sweet", 95), "20": ("grain", 85), "21": ("main", 50),
    "25": ("main", 47),
    "22": ("main", 30), "23": ("snack", 50),
}

BRAND_OK = {"USDA", "USDA'", "NFS", "BBQ"}
BRAND_WORDS = re.compile(
    r"\b(Pillsbury|Archway|Udi's|Oscar Mayer|Vitasoy|Hormel|Muscle Milk|Mission|Kellogg|Kashi|"
    r"Keebler|Nabisco|Martha White|Van's|Glutino|Rudi's|Schar|Mori-Nu|Silk|Ener-G|Nature's Own|"
    r"Smart Balance|Crunchmaster|Sara Lee|Heinz|Pepperidge|Kroger|Tostitos|Lean Pockets|"
    r"Hot Pockets|Babybel|Lance|Gardenburger|Morningstar|Boca|Worthington|Loma Linda|Mothers|"
    r"Kraft|Wonder|Entenmann|Lay's|Doritos|Stouffer|Banquet|Marie Callender|Healthy Choice|"
    r"Weight Watchers|Lean Cuisine|Amy's|Kid Cuisine|Tyson|Jimmy Dean|Eggo|Bisquick|Quaker|"
    r"Post|Ralston|Toaster|Pop-Tarts|Goya|Carrabba|Olive Garden|Applebee|Denny|Friday|"
    r"Chick-fil-a|McDonald|Burger King|Wendy|Subway|Taco Bell|Pizza Hut|Domino|Papa John|"
    r"Little Caesars|Popeyes|KFC|Arby|Dairy Queen|Sonic|Jack in the Box|Hardee|Carl's|Starbucks|"
    r"Dunkin|Kentucky|Long John|Sbarro|Schiff|Slim-Fast|Ensure|Boost|Glucerna|Enfamil|Similac|"
    r"Gerber|Beech-Nut|Earth's Best|school lunch|NFSMI|Formulated bar|Nutritional supplement|"
    r"Protein supplement|infant|toddler|baby food|babyfood|Child formula|Pediasure)\b",
    re.I,
)

# whole-description drops (any category)
DROP = re.compile(
    r"(\bwith added solution\b|\bAustralian\b|\bNew Zealand\b|\bimported\b|\bWagyu\b|\bindustrial\b|"
    r"\blow sodium\b|\breduced sodium\b|less/reduced sodium|\blow salt\b|\bsodium saccharin\b|"
    r"\baspartame\b|\bsucralose\b|\bsaccharin\b|\bacesulfame\b|\bartificial sweetener|"
    r"\blow calorie sweetener|\bdry mix\b|\bunprepared\b|\bundiluted\b|\bcondensed\b|"
    r"\bfrozen concentrate\b|\brefrigerated dough\b|\bseparable fat\b|\bselect\b|\bprime\b|"
    r"\bcomposite of\b|\bby-products\b(?!.*\b(liver|kidneys?)\b)|\bunenriched\b|"
    r"\bwith salt\b|\bsalted\b(?!.*butter)|\bwithout added ascorbic acid\b|\bmicrowaved\b|"
    r"\bmicrowave\b|\bheated\b|\breheated\b|\bnot reheated\b|\bgiblets\b|\bneck\b|\bback\b,|"
    r"\bskin only\b|\bexposed to ultraviolet\b|\bcooked in skin\b|"
    r"\bquality control\b|\bdried-frozen\b|\bcommercially prepared, frozen\b|\bshelf stable\b|"
    r"\benhanced\b|\bspecial purpose\b|\bdeep dish\b|\bcrumbles\b|\bpan-browned\b|"
    r"\bgluten-free\b|\bMargarine-like\b|"
    r"\bpowder, prepared\b|\b(?:kidney|navy|pinto), mature seeds, sprouted\b|\bpeas, mature seeds, sprouted|\blow carbohydrate\b|\bdiet\b|"
    r"\bnigari\b|\bmagnesium chloride\b|\bcalcium sulfate\b|\bmilk beverage\b|"
    r"\bprepared with (?:2%|1%|nonfat|skim|lowfat)\b|\bfrozen entree\b|\bpackaged mix\b|"
    r"\bboxed\b|\bmicrowavable\b|\bmicrowaveable\b|\bfrozen novelties\b|\bdietary\b|\bmeatless\b|"
    r"\bVital wheat\b|\bcrude\b|\bleavening\b|\bbran, crude\b|\bplain, dry\b|\bgeneric\b|"
    r"\binstant breakfast\b|\bwith lauric\b|\bsodium caseinate\b|\bchopped and formed\b|"
    r"\bregular pack\b|\bbrine pack\b|\bvacuum pack\b|\bseasoned\b|\bwhole bird\b|"
    r"\bretail parts\b|\bstewing\b|\bbroiler, rotisserie\b|\brotisserie\b|\bcapons\b|\bfeet\b|"
    r"\bmechanically\b|\bdripping\b|\bprotein fortified\b|"
    r"\bmixed nuts\b.*\bwithout peanuts\b|\bfor baking\b|\bnonfat\b.*\bdry\b|"
    r"\bdehydrated \(low|\blow-moisture\b|\bsulfured, stewed\b|\bextra heavy syrup\b|"
    r"\bextra light syrup\b|\bwater pack\b|\bjuice pack\b|\blight syrup\b|\bpimento\b)",
    re.I,
)

# obscure heads / items to skip (lowercase description starts or contains)
OBSCURE = re.compile(
    r"^(abiyuch|rowal|acerola|arrowhead|arrowroot|balsam-pear, leafy|borage|burdock|butterbur|"
    r"cardoon|celtuce|chrysanthemum|cornsalad|dock|epazote|eppaw|fiddlehead|fireweed|jute|"
    r"lambsquarters|pokeberry|purslane|sesbania|sowthistle|pepeao|jew's ear|kanpyo|mountain yam|"
    r"yambean|yautia|winged|hyacinth|cowpeas, leafy|amaranth leaves|chicory|cress|dandelion|"
    r"new zealand spinach|nopales|poi|carissa|cherimoya|feijoa|groundcherries|java-plum|"
    r"mammy-apple|nance|naranjilla|oheloberries|pitanga|rose-apples|roselle|sapote|horned melon|"
    r"crabapples|loganberries|boysenberries|elderberries|currants, european|quinces|"
    r"prickly pears|breadfruit|baobab|rambutan|mangosteen|durian|longans|loquats|kumquats|"
    r"guanabana|pummelo|tamarind nectar|sugar-apples|custard-apple|jujube|plantains, yellow, fried|"
    r"fish, (?:burbot|cusk|pout|scup|spot|sucker|sunfish|tilefish|wolffish|sheepshead|drum|ling|lingcod|cisco|greenland|roe|caviar|surimi|dolphinfish|salmon, chinook, smoked|herring, pacific|sturgeon|shad|turbot)|"
    r"mollusks, (?:abalone|conch|whelk|oyster, eastern, wild|oyster, eastern, farmed)|"
    r"crustaceans, (?:crab, (?:dungeness|queen|alaska)|crayfish|spiny lobster)|"
    r"nuts, (?:acorn|beechnut|butternut|breadnut|ginkgo|hickory|pilinut|formulated|chestnuts, (?:chinese|european|japanese))|"
    r"seeds, (?:breadfruit|breadnut|cottonseed|safflower|sisymbrium|lotus|sesame meal|sesame flour|sunflower seed flour|watermelon|pumpkin and squash seeds, whole)|"
    r"oil, (?:babassu|cupu|nutmeg|oat|poppyseed|sheanut|teaseed|tomatoseed|ucuhuba|wheat germ|soybean lecithin|apricot kernel|hazelnut|cocoa butter|walnut|almond|avocado|flaxseed|grapeseed|rice bran|safflower|cottonseed|corn and canola|mustard)|"
    r"fish oil|animal fat|shortening|wheat, (?:durum|hard|soft|kamut|sprouted)|triticale|"
    r"rennin|toppings|frostings|gelatin desserts|sweeteners?, |cocoa mix|carob|beverages, dairy drink mix|"
    r"beverages, malted|beverages, nutritional|beverages, protein|beverages, carbonated, low calorie|"
    r"beverages, water, bottled, (?!non)|beverages, cocktail mix|whiskey sour|alcoholic beverage, (?:liqueur|daiquiri|pina colada|whiskey sour|distilled, (?:gin|rum|vodka|whiskey), (?:86|90|94|100))|"
    r"cream substitute|sour dressing|beverage, instant|egg substitute|egg, (?:goose|duck|quail|turkey)|"
    r"egg, whole, (?:dried|frozen)|egg, white, dried|egg, yolk, (?:dried|frozen)|egg, white, frozen|"
    r"cheese, (?:caraway|cheshire|fontina|gjetost|goat, hard|goat, semisoft|limburger|mexican|muenster|neufchatel|port de salut|roquefort|tilsit|pasteurized process|brick|brie|camembert|colby|edam|gouda|gruyere|romano|provolone, reduced|ricotta, part skim|swiss, low|mozzarella, low|mozzarella, non|cheddar, (?:non|sharp|reduced))|"
    r"cheese product|cheese food|cheese spread|milk, (?:filled|imitation|indian buffalo|sheep|human|dry|canned, condensed|goat)|"
    r"yogurt, (?:chocolate|vanilla or lemon|fruit variety|greek, (?:strawberry|vanilla|nonfat, fruit))|"
    r"dulce|whey, (?:acid|sweet)|lamb, (?:foreshank|variety)|beef, (?:variety meats and by-products, (?!liver)|cured|plate|flank, steak, separable lean and fat|chuck, (?:clod|mock|under|arm|short ribs, boneless, separable lean only)|round, (?:eye|tip|bottom|full)|brisket, (?:flat|point)|loin, (?:top sirloin cap|tri)|top loin petite|ribeye petite|shoulder|bottom sirloin|chuck eye|rib, (?:small|large|whole|eye, small)|grass-fed)|"
    r"pork, (?:fresh, (?:variety|backfat|leg \(ham\), (?:rump|shank)|loin, (?:blade|sirloin|center rib|whole|top loin \(roasts\))|shoulder, (?:arm|blade)|composite)|cured, (?:ham -- water|ham and water|ham, (?:boneless|center|patties|rump|shank|slice|whole|separable)|salt pork|feet|shoulder|breakfast strips|canadian))|"
    r"chicken, (?:broilers or fryers, (?:meat and skin and giblets|light meat|dark meat, (?:drumstick|thigh)|leg|meat and skin, cooked, (?:fried, batter|stewed)|separable)|dark meat|cornish|roasting|capons|canned, no broth|meatless)|"
    r"turkey, (?:all classes, (?:back|heart|leg|neck|wing)|whole, (?:back|neck|giblets|skin|wing)|from whole|dark meat from|skin|light or dark|young|fryer|thigh, from|drumstick, from|wing, from|breast, from|mechanically)|"
    r"duck, young|duck, domesticated, liver|goose|pheasant|quail|ostrich|emu|squab|guinea|"
    r"soup, (?:bean with frankfurters|chicken gumbo|chunky|clam chowder, manhattan|cream of (?:asparagus|shrimp|onion|celery)|oyster stew|stock, fish|vegetable chicken|beef mushroom|chicken mushroom|pea, low|tomato beef|mushroom with beef|chili beef|turkey|ramen noodle, (?:beef|chicken|any), dry)|"
    r"gravy, (?:instant|au jus|unspecified)|sauce, (?:homemade|hoisin, |pasta, spaghetti/marinara, ready-to-serve, low)|"
    r"yokan|okara|natto|fuyu|koyadofu|tofu yogurt|vermicelli, made from soy|veggie burgers|vegetarian (?:fillets|meatloaf)|"
    r"soymilk, (?:chocolate and other|original and vanilla, light|original and vanilla, unfortified|\(all flavors\), (?:nonfat|lowfat|enhanced)|chocolate, (?:nonfat|unfortified))|"
    r"beans, (?:yellow|french|small white|cranberry|pink|black turtle|great northern|white|shellie|kidney, (?:california|royal)|navy, mature seeds, canned|pinto, immature)|lima beans|cowpeas, catjang|"
    r"lupins|mothbeans|mungo beans|broadbeans|yardlong|peanut flour|peanuts, (?:spanish|valencia|virginia)|"
    r"frankfurter, (?:low|meat and poultry|meat, heated)|bologna, (?:pork|turkey|meat and poultry)|"
    r"luxury loaf|mother's loaf|dutch brand|honey roll|picnic loaf|peppered loaf|pickle and pimiento|"
    r"olive loaf|luncheon|poultry salad|roast beef spread|corned beef loaf|ham salad|headcheese|"
    r"knackwurst|smoked link|beerwurst|blood sausage|braunschweiger|liverwurst|mortadella|"
    r"sausage, (?:chicken and beef|pork and turkey|turkey and pork|pork, turkey|berliner|vienna|smoked link)|"
    r"barbecue loaf|chicken spread|ham and cheese|cheesefurter|swisswurst|bockwurst|scrapple|"
    r"pastrami, turkey|turkey, (?:white, rotisserie|breast, smoked)|polish sausage|kielbasa, fully|"
    r"candies, (?:5th|sesame crunch|halavah|divinity|fondant|taffy|nougat|gumdrops, starch|marshmallows|praline|tamarind|chocolate covered, (?:caramel|low)|milk chocolate coated|dark chocolate coated|sugar-coated)|"
    r"puddings, (?:banana|coconut|lemon|rice, ready|chocolate flavor, low|all flavors)|syrups, (?:table blends|sugar free|malt|sorghum|grenadine|corn, (?:high|light|dark))|"
    r"sherbet|egg custards|flan|ice creams, (?:french|regular, low|bordeaux|vanilla, (?:light|rich|fat free))|"
    r"crackers, (?:rye|matzo|standard snack-type, sandwich|wheat, (?:low|reduced)|cheese, (?:low|sandwich)|melba|milk)|"
    r"cookies, (?:animal|fig|fortune|gingersnaps, |ladyfingers|marshmallow|molasses|raisin|vanilla sandwich|chocolate sandwich, with extra|butter, commercially prepared, enriched|brownies, dry)|"
    r"bread, (?:reduced-calorie|protein|egg|italian|irish|oatmeal, toasted|pumpernickel, toasted|raisin, toasted|rice bran|cracked-wheat|wheat, toasted|white, commercially prepared, toasted|whole-wheat, commercially prepared, toasted|stuffing|pound cake|boston|cornbread|salvadoran|rye, reduced|mixed-grain, toasted|french or vienna, toasted|multi-grain, toasted|pita, white, un|crumbs, dry, grated, seasoned|spoonbread|chapati or roti, plain)|"
    r"cake, (?:pudding-type|snack|boston|shortcake|fruitcake|white, prepared|yellow, prepared|gingerbread)|"
    r"coffeecake|danish pastry, (?:lemon|nut)|pie, (?:fried|egg custard|pecan, prepared|coconut custard|peach|lemon meringue, commercially|blueberry, prepared|cherry, prepared|apple, prepared|chocolate creme|banana cream, prepared)|"
    r"pie crust|phyllo|puff pastry|toaster pastries|tortillas, ready-to-bake or -fry, flour, shelf|"
    r"rolls, (?:hard|hamburger or hotdog, (?:mixed|reduced))|sweet rolls|taco shells, baked|"
    r"waffles, (?:plain, prepared|buttermilk)|waffle, buttermilk|french toast, frozen|"
    r"muffins, (?:blueberry, (?:toaster|commercially prepared \(includes mini)|corn, (?:toaster|dry)|oat bran|wheat bran|english, (?:mixed|wheat|whole|raisin|plain, toasted))|"
    r"english muffins|pancakes, (?:plain, frozen|special|blueberry|buckwheat|whole-wheat)|"
    r"crackers, saltines, (?:low|unsalted|whole)|wonton wrappers|croutons, (?:plain)|"
    r"doughnuts, (?:cake-type, (?:chocolate|wheat)|french)|hush puppies|cream puffs, (?:prepared from recipe, shell)|"
    r"wheat flour, (?:white \(|white, (?:tortilla|cake|bread)|whole-grain, soft)|wheat flours|"
    r"cornmeal, (?:degermed|white, self|yellow, self)|corn flour, (?:yellow, degermed|masa, white|whole-grain, (?:blue|white))|"
    r"rice, white, (?:glutinous|short-grain|medium-grain|long-grain, (?:parboiled|precooked))|rice, brown, medium|"
    r"pasta, (?:fresh-refrigerated|homemade|corn|whole grain, 51%|dry)|spaghetti, protein|macaroni, (?:vegetable|protein)|"
    r"noodles, (?:japanese, somen|egg, spinach|flat, crunchy|chinese, chow mein)|"
    r"rice noodles, dry|sorghum|amaranth|hominy|semolina, un|oat flour|rye flour|barley flour|"
    r"cereals, (?:corn grits, (?:white, regular and quick, enriched, cooked with water, with salt|yellow)|farina, (?:un|enriched, assorted brands including cream of wheat, quick)|oats, (?:instant, fortified, (?:with|maple)|regular and quick and instant, not))|incaparina|"
    r"snacks, (?:beef|pork skins|crisped rice|granola bites|candy|soy chips|pita chips|sesame|oriental|shrimp cracker|yucca|taro|rice cracker|potato chips, (?:made from|fat-free|reduced|white, restructured|cheese|sour|barbecue)|potato sticks|tortilla chips, (?:light|nacho|ranch|taco|low)|corn-based, extruded, (?:onion|puffs)|popcorn, (?:cakes|home-prepared|microwave, low|cheese|caramel-coated, with|oil-popped, loose)|trail mix, tropical|fruit leather, pieces|brown rice|bagel chips|cornnuts|granola bars, (?:soft, (?:uncoated, (?:nut|raisin|peanut butter and)|coated|almond)|hard, (?:almond|chocolate|peanut butter)|with))|"
    r"breakfast bar|milk and cereal bar|rice and wheat cereal bar|granola bar, soft|snack, (?:mixed berry|potato|pretzel)|"
    r"fast foods?, (?:biscuit|breakfast|croissant|english muffin|egg|hush|nachos|chicken tenders|crab cake|"
    r"danish|miniature cinnamon|potatoes, hash|onion rings|shrimp, breaded|fish sandwich|clams|"
    r"cheeseburger; (?:double|single, large)|hamburger; (?:double|single, large)|roast beef|"
    r"submarine sandwich, (?:cold cut|ham|oven roasted|roast|steak|sweet|tuna)|taco salad|chimichanga|enchirito|"
    r"burrito|frijoles|sundae|milk beverage|griddle|cheeseburger, double|hotdog|corndog|quesadilla|potato, mashed|"
    r"coleslaw|sandwich|salad|chili|cheese sauce|fried pie|ice milk|shake|french toast)|"
    r"taquitos|turnover|pizza rolls|pasta mix|rice mix|rice and vermicelli|spanish rice|yellow rice|"
    r"macaroni and cheese (?:dinner|loaf|,? ?frozen|,? ?canned)|macaroni and cheese, (?:dry|canned|frozen|box mix)|"
    r"macaroni or noodles|salisbury|beef, corned beef hash|corn dogs|chili, no beans|chili with beans|"
    r"sausage, egg and cheese|pasta with sliced franks|chicken, thighs, frozen|potsticker|"
    r"tortellini|ravioli, cheese with|dumpling|chicken tenders|turkey, stuffing|burrito|"
    r"beverages, (?:citrus|cranberry-|orange and apricot|pineapple and|grape drink|orange breakfast|"
    r"fruit punch-flavor|fruit-flavored|chocolate-flavor|chocolate syrup|coffee substitute|coffee and cocoa|"
    r"rich chocolate|shake|yellow green|tea, (?:instant|herb, (?:chamomile|other))|coffee, instant, (?:decaf|with|mocha|vanilla|chicory)|"
    r"water, (?:bottled|tap, (?:municipal|well))|carbonated, (?:reduced|tonic|club|pepper|root|lemon-lime soda, no)|"
    r"energy drink|almond milk, (?:chocolate|sweetened)|rice milk|coconut milk, sweetened)|"
    r"water, (?:with corn|non-carbonated, bottles)|carbonated beverage|strawberry-flavor|lemonade, (?:frozen|powder)|limeade|"
    r"cranberry juice cocktail, frozen|malt beverage|shake, fast|alcoholic beverage, wine, (?:dessert|table, (?:red, |white, ))|"
    r"alcoholic beverage, beer, (?:regular, budweiser|light, (?:budweiser|michelob|bud)|higher alcohol)|"
    r"spices, (?:chervil|mace|savory|marjoram|tarragon|anise|allspice|poultry|pumpkin pie|dill seed|celery seed|caraway|pepper, white|sage)|"
    r"seasoning mix|vanilla extract, imitation|spearmint|peppermint|rosemary, fresh|thyme, fresh|dill weed, fresh|capers|"
    r"salt, table, iodized|salad dressing, (?:bacon|home recipe|coleslaw|french, (?:home|diet)|russian dressing, low|"
    r"mayonnaise, (?:imitation|light|soybean and safflower)|mayonnaise type|sesame seed|kraft|blue or roquefort cheese dressing, (?:fat|light|low)|"
    r"italian dressing, (?:diet|fat-free|reduced)|ranch dressing, (?:fat|light|reduced)|thousand island dressing, (?:fat|reduced)|"
    r"caesar dressing, low|french dressing, (?:fat|reduced)|honey mustard dressing, reduced|peppercorn)|"
    r"mayonnaise dressing|creamy dressing|butter replacement|butter, light|butter oil|margarine, (?:regular, (?:hard|liquid|tub)|margarine-type|industrial)|"
    r"dressing, honey mustard, fat)",
    re.I,
)

CAT_ADJUST = [  # (regex on description, our category)
    (re.compile(r"^Eggs?,", re.I), "egg"),
    (re.compile(r"^(Rice|Wild rice)\b(?!.*\b(?:cakes?|crackers?)\b)", re.I), "rice"),
    (re.compile(r"^(Rice cakes?|Rice crackers?|Snacks, rice)", re.I), "snack"),
    (re.compile(r"^Noodles, chinese, cellophane", re.I), "grain"),
    (re.compile(r"^Beans, (snap|fava, in pod)", re.I), "vegetable"),
    (re.compile(r"^Mustard (greens|spinach)", re.I), "vegetable"),
    (re.compile(r"^Wasabi", re.I), "condiment"),
    (re.compile(r"^(Cookies?|Cake|Pie|Doughnuts|Cream puffs?|Brownies|Danish|Cream puffs|Eclairs|Cheesecake|Pastry|Croissants, chocolate)\b", re.I), "sweet"),
    (re.compile(r"^(Crackers|Pretzels)\b", re.I), "snack"),
    (re.compile(r"^(Salad dressing|Mayonnaise|Dressing)\b", re.I), "condiment"),
    (re.compile(r"^(Sauce|Gravy|Catsup|Pickle|Pickles|Mustard,|Horseradish|Vinegar|Salsa)\b", re.I), "condiment"),
    (re.compile(r"^(Peanut butter|Peanuts)\b", re.I), "nut_seed"),
    (re.compile(r"^(Oats|Cereals, oats|Cereals ready-to-eat)\b", re.I), "breakfast"),
    (re.compile(r"^(Pancakes|Waffles|French toast)\b", re.I), "breakfast"),
    (re.compile(r"^[^,]*\b(?:juice|nectar)\b|^Beverages|^Alcoholic|^Lemonade|^Cranberry juice", re.I), "beverage"),
    (re.compile(r"^(Soy sauce|Miso)\b", re.I), "condiment"),
    (re.compile(r"^(Salad|Coleslaw|Potato salad)\b", re.I), "salad"),
    (re.compile(r"^(Fast foods?|Pizza)\b", re.I), "main"),
    (re.compile(r"^(Soup|Split pea)", re.I), "soup"),
    (re.compile(r"^(Butter|Ghee)\b", re.I), "fat_oil"),
    (re.compile(r"^Snacks, (popcorn|trail mix|banana chips)", re.I), "snack"),
    (re.compile(r"^(Chickpea|Hummus|Falafel|Tofu|Tempeh|Soybeans|Soymilk|Lentils|Beans|Peas, split|Cowpeas, common|Mung beans, mature seeds, (?!sprouted)|Pigeon peas)", re.I), "legume"),
]

# --------------------------------------------------------------------------------------
# friendly-name rules
# --------------------------------------------------------------------------------------
DROP_PARTS = {
    "raw", "all commercial varieties", "all varieties", "all areas", "all types", "mixed species",
    "solids and liquids", "without salt", "without salt added", "no salt added", "drained",
    "enriched", "regular", "fresh", "fluid", "broilers or fryers", "broiler or fryers",
    "all classes", "domesticated", "separable lean and fat", "all grades", "choice",
    "mature seeds", "mature seed", "commercial", "commercially prepared", "prepared",
    "ready-to-serve", "ready-to-eat", "ready to serve", "ready to drink", "canned or bottled",
    "bottled", "unheated", "plain", "includes skin", "with skin", "unspecified", "original",
    "boneless", "bone-in", "lip-on", "lip off", "wild", "farmed", "shelled", "whole", "home recipe",
    "homemade", "home-prepared", "prepared from recipe", "drained solids", "cooked, boiled",
    "immature seeds", "flesh and skin", "without peel", "with peel", "unsweetened", "ns as to form",
    "type of kernels unspecified", "with added vitamin a and vitamin d", "meat only", "lean meat",
    "pan-broiled", "from concentrate", "includes from concentrate", "chilled", "dried",
    "cooked with water", "unsalted", "without added salt", "without salt added", "nfs",
}
DROP_PART_RE = re.compile(
    r"^(with added .*|trimmed to .*|fortified .*|includes .*|made with .*|contains .*|\d+% .*protein|"
    r"with vitamin.*|vitamins .*|made from .*unenriched.*|excluding .*|pods, excluding.*|"
    r"frozen, (?:chopped|whole)|not packed|prepared with water|diluted with.*)$",
    re.I,
)
PREP_WORDS = {"raw", "cooked", "boiled", "baked", "roasted", "grilled", "broiled", "fried", "stewed",
              "braised", "steamed", "canned", "frozen", "dried", "sauteed", "stir-fried", "smoked",
              "dry roasted", "oil roasted", "toasted", "poached", "simmered", "scrambled", "hard-boiled",
              "pan-fried", "dry heat", "moist heat", "uncooked", "dry", "sweetened", "pickled",
              "light", "lowfat", "nonfat", "whole milk", "reduced fat", "fat free", "salted"}

# heads that become "<qualifier> <head>", e.g. "Cheese, cheddar" -> "Cheddar cheese"
INVERT = {
    "cheese": "cheese", "beans": "beans", "oil": "oil", "soup": "soup", "sauce": "sauce",
    "cookies": "cookies", "crackers": "crackers", "pie": "pie", "cake": "cake",
    "ice creams": "ice cream", "puddings": "pudding", "yogurt": "yogurt", "bread": "bread",
    "rolls": "rolls", "muffins": "muffin", "syrups": "syrup", "syrup": "syrup",
    "salad dressing": "dressing", "rice": "rice", "noodles": "noodles", "peppers": "peppers",
    "squash": "squash", "mushrooms": "mushrooms", "lettuce": "lettuce", "sugars": "sugar",
    "doughnuts": "doughnut", "bagels": "bagel", "gravy": "gravy", "vinegar": "vinegar",
    "tortillas": "tortilla", "pickles": "pickles", "sausage": "sausage", "frankfurter": "frankfurter",
    "bologna": "bologna", "salami": "salami", "bratwurst": "bratwurst", "grapes": "grapes",
    "melons": "melon", "cabbage": "cabbage", "onions": "onions", "potatoes": "potatoes",
    "tomatoes": "tomatoes", "olives": "olives", "raisins": "raisins", "grapefruit": "grapefruit",
    "mustard": "mustard", "pasta": "pasta", "tea": "tea", "coffee": "coffee", "wine": "wine",
    "beer": "beer", "margarine": "margarine", "cream": "cream", "cornmeal": "cornmeal",
    "flour": "flour", "wheat flour": "wheat flour", "rice flour": "rice flour", "dates": "dates",
    "chocolate": "chocolate", "candies": "", "spices": "", "nuts": "", "seeds": "",
    "fish": "", "crustaceans": "", "mollusks": "", "snacks": "", "beverages": "",
    "cereals ready-to-eat": "cereal", "cereals": "", "alcoholic beverage": "", "fast foods": "",
    "fast food": "", "tofu": "tofu", "soymilk": "soymilk", "cherries": "cherries",
    "strawberries": "strawberries", "pears": "pear", "apples": "apple", "oranges": "orange",
    "plums": "plum", "peaches": "peach", "carrots": "carrots", "corn": "corn", "peas": "peas",
    "pizza": "pizza",
}
SINGULAR = {
    "apples": "apple", "bananas": "banana", "pears": "pear", "plums": "plum", "peaches": "peach",
    "oranges": "orange", "lemons": "lemon", "limes": "lime", "mangos": "mango", "papayas": "papaya",
    "guavas": "guava", "figs": "fig", "nectarines": "nectarine", "apricots": "apricot",
    "tangerines": "tangerine", "clementines": "clementine", "avocados": "avocado",
    "pomegranates": "pomegranate", "persimmons": "persimmon", "kiwifruit": "kiwi",
    "litchis": "lychee", "tamarinds": "tamarind", "carrots": "carrot", "beets": "beetroot",
    "radishes": "radish", "turnips": "turnip", "parsnips": "parsnip", "tomatoes": "tomato",
    "potatoes": "potato", "onions": "onion", "leeks": "leek", "shallots": "shallot",
    "artichokes": "artichoke", "doughnuts": "doughnut", "bagels": "bagel", "muffins": "muffin",
    "croissants": "croissant", "biscuits": "biscuit", "pancakes": "pancake", "waffles": "waffle",
    "tortillas": "tortilla", "brownies": "brownie", "pretzels": "pretzels", "mushrooms": "mushrooms",
    "collards": "collard greens", "sweet potatoes": "sweet potato", "yams": "yam",
    "eggplants": "eggplant", "cucumbers": "cucumber", "melons": "melon", "sapodilla": "chikoo",
    "jackfruit": "jackfruit", "egg": "egg", "eggs": "egg",
}
CUTS = ("breast", "thigh", "drumstick", "wing", "leg", "liver", "heart", "gizzard", "ground",
        "dark meat", "light meat", "tenderloins", "tenderloin", "loin", "spareribs", "ribs",
        "shoulder", "belly", "chop", "chops", "steak", "roast", "brisket", "flank", "sirloin",
        "top sirloin", "ribeye", "rib eye", "round", "top round", "chuck", "short ribs",
        "t-bone", "porterhouse", "top loin", "tongue", "kidneys", "rib", "shank", "cubed",
        "bacon", "ham", "skirt", "strip steaks")

PROPER = {"greek": "Greek", "swiss": "Swiss", "american": "American", "atlantic": "Atlantic",
          "pacific": "Pacific", "alaska": "Alaska", "italian": "Italian", "french": "French",
          "english": "English", "mexican": "Mexican", "chinese": "Chinese", "japanese": "Japanese",
          "thai": "Thai", "latino": "Latino", "new": "new", "england": "England", "polish": "Polish", "canadian": "Canadian", "cheddar": "cheddar",
          "parmesan": "parmesan", "monterey": "Monterey", "brazilnuts": "Brazil nuts",
          "danish": "Danish", "belgian": "Belgian", "california": "California",
          "florida": "Florida", "russian": "Russian", "caesar": "Caesar", "thompson": "Thompson"}

# Hand-picked staples: fdc_id -> "Name|alias|alias". These are always included (they bypass
# the brand/obscure filters, not the energy check) and take this exact name.
FORCE_RAW = """
171265 Milk, whole (3.25%)|full cream milk|doodh
171267 Milk, 2% reduced fat|toned milk
170872 Milk, 1% low fat|double toned milk
171269 Milk, skim|skimmed milk|fat free milk
172225 Cultured buttermilk, whole
170874 Cultured buttermilk, low fat
171284 Yogurt, plain, whole milk|curd|dahi
170886 Yogurt, plain, low fat|low fat curd
170887 Yogurt, plain, skim milk|fat free curd
171304 Greek yogurt, plain, whole milk|hung curd
170903 Greek yogurt, plain, low fat
170894 Greek yogurt, plain, nonfat
173430 Butter, unsalted|makhan
173410 Butter, salted|makkhan|table butter
171314 Ghee (clarified butter)|ghee|clarified butter|desi ghee
173414 Cheddar cheese
170845 Mozzarella cheese, whole milk
170847 Mozzarella cheese, part skim
170851 Ricotta cheese, whole milk
172179 Cottage cheese, creamed
173417 Cottage cheese, 1% low fat
173418 Cream cheese
173420 Feta cheese
171247 Parmesan cheese, grated
170859 Heavy whipping cream|fresh cream|malai
170858 Light whipping cream
171255 Half and half cream
171257 Sour cream
172194 Evaporated milk
171275 Sweetened condensed milk|condensed milk|milkmaid
171287 Egg, whole, raw|anda
173424 Egg, hard-boiled|boiled egg|ubla anda
172187 Egg, scrambled
173423 Egg, fried|fried egg
172186 Egg, poached
172185 Egg omelet, plain|omelette
172183 Egg white, raw|egg whites
172184 Egg yolk, raw
168877 White rice, long-grain, raw|chawal|rice
168878 White rice, long-grain, cooked|boiled rice|chawal
169703 Brown rice, long-grain, raw
169704 Brown rice, long-grain, cooked
169714 Rice flour, white|chawal ka atta
173904 Oats, rolled, dry|oats|porridge oats
173905 Oatmeal, cooked with water|porridge|oats porridge
171661 Instant oats, dry
171662 Instant oatmeal, cooked with water
168893 Whole wheat flour|atta|gehun ka atta
168894 All-purpose flour (maida)|maida|refined flour
169715 Semolina|sooji|suji|rava
169737 Pasta, cooked|macaroni|penne
169736 Pasta, dry
168874 Quinoa, uncooked
168917 Quinoa, cooked
169702 Millet, raw|millet
168871 Millet, cooked
170286 Buckwheat|kuttu
170284 Barley, pearled|jau
170285 Barley, pearled, cooked
169698 Cornstarch|corn flour (starch)
170688 Bulgur (cracked wheat), dry|dalia|daliya|broken wheat
170287 Bulgur (cracked wheat), cooked|dalia|daliya
169717 Tapioca pearls, dry|sabudana|sago
174288 Chickpea flour (besan)|besan|gram flour
173756 Chickpeas, dry|kabuli chana|garbanzo beans|chole
173757 Chickpeas, boiled|boiled chana|garbanzo beans
173744 Red kidney beans, dry|rajma
175194 Red kidney beans, boiled|rajma
174256 Mung beans, dry|moong|green gram|sabut moong
174257 Mung beans, boiled|moong
169957 Mung bean sprouts|moong sprouts|bean sprouts
172420 Lentils, dry|masoor|sabut masoor
172421 Lentils, boiled|masoor
174284 Red lentils, dry|masoor dal|red lentil
172428 Split peas, dry|matar dal
172429 Split peas, boiled
172436 Pigeon peas, dry|toor dal|arhar dal|tuvar dal
172437 Pigeon peas, boiled|toor dal|arhar
174259 Black gram (urad), dry|urad dal|urad|black gram|mungo beans
172427 Black gram (urad), boiled|urad
173758 Black-eyed peas, dry|lobia|chawli|cowpeas
173759 Black-eyed peas, boiled|lobia
174270 Soybeans, dry|soya bean
174271 Soybeans, boiled|soya bean
172475 Tofu, firm|soya paneer|bean curd
172476 Tofu, regular|bean curd
172456 Soy milk|soya milk|soymilk
172430 Peanuts, raw|moongphali|groundnut|mungfali
173806 Peanuts, dry roasted|roasted peanuts|moongphali
172470 Peanut butter, smooth
172469 Peanut butter, chunky
170567 Almonds|badam
170162 Cashews, raw|kaju|cashew nuts
170571 Cashews, dry roasted|kaju
170187 Walnuts|akhrot
170184 Pistachios|pista
170185 Pistachios, dry roasted|pista
170169 Coconut, fresh|nariyal|coconut meat|thengai
170170 Desiccated coconut, unsweetened|copra|dry coconut|khopra
170174 Coconut water|nariyal pani|tender coconut water
170172 Coconut milk|nariyal doodh
170173 Coconut milk, canned
170554 Chia seeds
169414 Flaxseeds|alsi|flax seeds
170150 Sesame seeds|til
170562 Sunflower seeds
170556 Pumpkin seeds|pepitas
168591 Lotus seeds (makhana), raw|makhana|fox nut|phool makhana
170149 Lotus seeds (makhana), dried|makhana|fox nut
170148 Hemp seeds, hulled
170581 Hazelnuts
170591 Pine nuts|chilgoza
170569 Brazil nuts
170178 Macadamia nuts
170182 Pecans
168604 Tahini|sesame paste
168588 Almond butter
170585 Mixed nuts, dry roasted
173944 Banana|kela
171688 Apple, with skin|seb|apple
171689 Apple, peeled|seb
169910 Mango|aam
169926 Papaya|papita
173044 Guava|amrood|peru
167759 Sapodilla (chikoo)|chiku|sapota|chikoo
169097 Orange|santra|narangi
169105 Mandarin orange|kinnow|tangerine|santra
174683 Grapes, red or green|angoor
169134 Pomegranate|anar
167765 Watermelon|tarbooz
169092 Cantaloupe (muskmelon)|kharbuja|muskmelon
169124 Pineapple|ananas
174687 Jackfruit|kathal|chakka|palapazham
169086 Lychee|litchi
167762 Strawberries
168153 Kiwi fruit|kiwi
169118 Pear|nashpati|naspati
169949 Plum|aloo bukhara
169928 Peach|aadu
171719 Cherries, sweet
167763 Tamarind|imli
171726 Dates, deglet noor|khajoor|khajur
168191 Dates, medjool|khajoor
168165 Raisins, dark seedless|kishmish|munakka
168164 Golden raisins|kishmish
174665 Figs, dried|anjeer|anjir
173021 Fig, fresh|anjeer
173941 Apricots, dried|khubani|khumani
168162 Prunes, dried
171705 Avocado|butter fruit
167746 Lemon|nimbu|lime
168155 Lime|nimbu
167747 Lemon juice, fresh|nimbu ras|nimbu pani (unsweetened)
169098 Orange juice, fresh|santre ka ras|mosambi juice
171711 Blueberries
167755 Raspberries
171722 Cranberries
171723 Dried cranberries, sweetened
169914 Nectarine
171697 Apricot|khubani
171715 Star fruit (carambola)|kamrakh|carambola
169911 Honeydew melon
173043 Cape gooseberries|rasbhari|physalis|golden berry
168150 Jamun (java plum)|jamun|black plum|jambolan|naval pazham
168151 Jujube|ber|bor|elanthapazham
168175 Custard apple (sitaphal)|sitaphal|sharifa|sugar apple|seethapazham
169130 Plantain, ripe|nendran|ethapazham
168215 Raw banana (green plantain)|kacha kela|raw plantain|vazhakkai
168216 Raw banana, boiled|kacha kela
168393 Bitter gourd (karela)|karela|bitter melon|pavakkai|kakarakaya
168394 Bitter gourd, boiled|karela
169232 Bottle gourd (lauki)|lauki|doodhi|ghiya|calabash|sorakaya
169233 Bottle gourd, boiled|lauki
168414 Ridge gourd (turai)|turai|tori|luffa|beerakaya|peerkangai
168415 Ridge gourd, boiled|turai
170069 Ash gourd (petha)|petha|wax gourd|winter melon|kumbalanga|poosanikai
170475 Ash gourd, boiled|petha
170483 Drumstick (moringa) pods|drumstick|sahjan|murungakkai|moringa
170484 Drumstick pods, boiled|drumstick
169301 Water spinach (kalmi saag)|kalmi|kangkong|water convolvulus
169302 Water spinach, boiled|kalmi saag
170474 Malabar spinach (poi saag)|poi|basella|pasalai keerai
168487 Colocasia leaves (arbi patta)|arbi ke patte|taro leaves|patra
169308 Colocasia root (arbi)|arbi|taro|chembu|seppankizhangu
168486 Colocasia root, cooked|arbi|taro
170071 Yam|ratalu
169985 Cassava (tapioca root)|kappa|tapioca|maravalli kizhangu
168482 Sweet potato|shakarkandi|sakkaravalli
168483 Sweet potato, baked|shakarkandi
170026 Potato|aloo|batata
170440 Potato, boiled (peeled)|aloo|boiled potato
170093 Potato, baked with skin|aloo
170457 Tomato|tamatar|thakkali
170000 Onion|pyaz|kanda|vengayam
169230 Garlic|lahsun|lasun|poondu
169231 Ginger, fresh|adrak|inji
168462 Spinach|palak|keerai
168463 Spinach, boiled|palak
169986 Cauliflower|gobi|phool gobi
170397 Cauliflower, boiled|gobi
169975 Cabbage|patta gobi|bandh gobi|muttaikose
169976 Cabbage, boiled|patta gobi
170393 Carrot|gajar
170394 Carrot, boiled|gajar
169260 Okra (bhindi)|bhindi|lady finger|ladies finger|vendakkai
169261 Okra, boiled|bhindi
169228 Eggplant (brinjal)|baingan|brinjal|aubergine|kathirikai|vankaya
169229 Eggplant, boiled|baingan
170419 Green peas|matar|hara matar|pattani
170420 Green peas, boiled|matar
169961 Green beans|french beans|beans|phali
169141 Green beans, boiled|french beans
169222 Long beans (yardlong)|chawli phali|barbati|payaru|lobia phali
169223 Long beans, boiled|chawli phali
168409 Cucumber|kheera|kakdi|vellarikkai
169276 Radish, red
168451 White radish (mooli)|mooli|daikon|mullangi
168452 White radish, boiled|mooli
169145 Beetroot|chukandar
168448 Pumpkin|kaddu|kashiphal|parangikai
168449 Pumpkin, boiled|kaddu
170427 Capsicum, green|shimla mirch|bell pepper|green pepper
170108 Capsicum, red|red bell pepper
169383 Capsicum, yellow|yellow bell pepper
170497 Green chilli|hari mirch|chili pepper
170106 Red chilli, fresh|lal mirch
169997 Coriander leaves|dhania|cilantro|kothmir|kothamalli
173475 Mint leaves|pudina|spearmint
168385 Amaranth leaves|chaulai|rajgira leaves|thotakura|mulai keerai
169256 Mustard greens (sarson)|sarson|sarson ka saag
169257 Mustard greens, boiled|sarson ka saag
170005 Spring onion|hara pyaz|scallions|green onion
169251 Mushrooms, white|khumbi|button mushroom
169998 Sweet corn|bhutta|makka|corn on the cob
169999 Sweet corn, boiled|bhutta|makka
169291 Zucchini
170025 Pigeon peas, green (fresh tuvar)|tuvar lilva|lilva|green toor
170430 Pigeon peas, green, boiled|tuvar lilva
169250 Lotus stem (kamal kakdi)|kamal kakdi|lotus root|nadru
168424 Kohlrabi (knol khol)|ganth gobhi|nool kol|knol khol
170465 Turnip|shalgam
169282 Green soybeans (edamame)|edamame
170923 Cumin seeds|jeera
170924 Curry powder
172231 Turmeric powder|haldi
171319 Chili powder (blend)
170919 Cardamom|elaichi
171320 Cinnamon, ground|dalchini
170931 Black pepper|kali mirch
171323 Fennel seeds|saunf
171324 Fenugreek seeds|methi dana
170929 Mustard seeds|rai|sarson
170926 Ginger powder|sonth|saunth
171326 Nutmeg|jaiphal
170934 Saffron|kesar
170917 Bay leaf|tej patta
173468 Salt|namak
171330 Poppy seeds|khus khus|khuskhus
171325 Garlic powder
172336 Canola oil
171412 Coconut oil|nariyal tel|velichenna
171413 Olive oil
171410 Groundnut oil|peanut oil|moongphali tel
171016 Sesame oil (gingelly)|til ka tel|gingelly oil|nallennai
171411 Soybean oil|soya oil
171025 Sunflower oil
172338 Sunflower oil, high oleic
172337 Mustard oil|sarson ka tel|kachi ghani
171013 Rice bran oil
171011 Vanaspati (hydrogenated vegetable fat)|dalda|vanaspati ghee
171015 Palm oil
171009 Mayonnaise|mayo
169655 Sugar, white|cheeni|shakkar
168833 Brown sugar
169640 Honey|shahad
169656 Powdered sugar|icing sugar
169661 Maple syrup
169641 Jam (fruit preserves)|jam|fruit jam
168819 Orange marmalade|marmalade
167587 Milk chocolate
170273 Dark chocolate, 70-85% cacao
170272 Dark chocolate, 60-69% cacao
167571 White chocolate
167575 Ice cream, vanilla
168809 Ice cream, chocolate
168810 Ice cream, strawberry
168000 Chocolate hazelnut spread
168820 Molasses
173227 Black tea, brewed|tea (no milk)|kali chai
171917 Green tea, brewed
171890 Coffee, brewed|black coffee
171891 Espresso
174130 Instant coffee, powder
173647 Water|pani
174852 Cola|coke|soft drink
174846 Ginger ale
174854 Orange soda
174831 Coconut water, packaged
171903 Cranberry juice cocktail
174108 Energy drink
173177 Whey protein powder (isolate)|whey protein|protein powder
174832 Almond milk, unsweetened
168746 Beer, regular|beer
168749 Beer, light|light beer
173190 Wine, red|red wine
174837 Wine, white|white wine
174815 Spirits, 80 proof (vodka, whisky, rum, gin)|whisky|whiskey|vodka|rum|gin|brandy
170649 Potato chips|wafers|crisps|aloo chips
168116 Tortilla chips|nachos
167959 Popcorn, air-popped|popcorn
170247 Popcorn, oil-popped|popcorn
170249 Pretzels, hard
167561 Trail mix
170250 Rice cakes
168849 Banana chips|kele ke chips|nendran chips
167542 Granola bar, hard
167954 Granola bar, soft
174924 White bread|bread|sandwich bread|double roti
172688 Whole wheat bread|brown bread|atta bread
168013 Multigrain bread
174915 Pita bread
171845 Naan, store-bought|naan
174077 Naan, whole wheat, store-bought
171844 Chapati, store-bought|roti
175049 Bagel, plain
174987 Croissant, butter
172796 Burger bun|hot dog bun|bun
174981 Rusk|toast rusk|cake rusk
172725 Oatmeal cookies
172716 Chocolate chip cookies
171867 Marie biscuits|marie biscuit|tea biscuit
172746 Saltine crackers|cream crackers
174957 Graham crackers
172706 Sponge cake|plain cake
172711 Cheesecake
174934 Chocolate cake with frosting
174945 Vanilla cake with frosting
172768 Blueberry muffin
175009 Pancake|pancakes
172757 Doughnut, cream filled|donut
174992 Doughnut, glazed|donut
170698 French fries (fast food)|fries|finger chips
173294 Cheese pizza, thin crust|pizza
173293 Cheese pizza, thick crust|pizza
170366 Sausage pizza, thin crust
170365 Sausage pizza, thick crust
170690 Cheeseburger, plain
170691 Cheeseburger with condiments
170693 Hamburger, plain
170694 Hamburger with condiments
170710 Hamburger, large, with condiments
170718 Fried chicken pieces, boneless|chicken nuggets|popcorn chicken
170756 Fried chicken breast (fast food)|fried chicken
170359 Fried chicken thigh (fast food)|fried chicken
170360 Fried chicken wing (fast food)|fried chicken
170295 Chicken sandwich (fast food)|chicken burger
170368 Grilled chicken sandwich (fast food)
170689 Beef taco, hard shell|taco
170763 Beef taco, soft|taco
170764 Chicken taco, soft|taco
170775 Strawberry banana smoothie
170355 Yogurt parfait with granola
172100 Pasta in tomato sauce (no meat)
172099 Spaghetti with meatballs
172105 Vegetable spring rolls|egg rolls|spring roll
172106 Vegetable lasagna
172114 Lasagna with meat sauce
173333 Cheese lasagna
173328 Cheese ravioli
173330 Beef stew
172097 Chili con carne with beans
171192 Pasta sauce (marinara)|marinara
174523 Barbecue sauce|bbq sauce
174524 Salsa
174527 Hot sauce|chilli sauce
171610 Worcestershire sauce
174277 Soy sauce|soya sauce
174531 Fish sauce
174529 Oyster sauce
174066 Sweet and sour sauce
171167 Teriyaki sauce
171186 Sriracha
168556 Tomato ketchup|ketchup|catsup|tomato sauce
172234 Mustard, yellow
171826 Tartar sauce
171579 Pesto
174536 Chicken broth|chicken stock
171583 Vegetable broth|vegetable stock
174808 Hot and sour soup
171821 Wonton soup
174807 Egg drop soup
171176 Tomato soup|tamatar soup
171077 Chicken breast, raw (skinless)|chicken breast
171477 Chicken breast, roasted (skinless)
171534 Chicken breast, grilled|grilled chicken breast
172385 Chicken thigh, raw (skinless)|chicken thigh
172388 Chicken thigh, roasted (skinless)
172373 Chicken drumstick, raw (skinless)|leg piece
173612 Chicken drumstick, roasted (skinless)|leg piece
173632 Chicken wing, raw (skinless)
172392 Chicken wing, roasted (skinless)
171052 Chicken, meat only, raw|chicken
171054 Chicken, meat only, roasted|chicken
171447 Chicken, meat and skin, raw|chicken with skin
171450 Chicken, meat and skin, roasted
171060 Chicken liver|kaleji
171116 Ground chicken (chicken keema)|chicken keema|chicken mince
175303 Goat meat (mutton), raw|mutton|bakra|goat meat
175304 Goat meat (mutton), roasted|mutton
174370 Ground lamb (keema)|lamb mince|keema|kheema
172544 Ground lamb, broiled|keema
174313 Lamb leg, lean, raw
174314 Lamb leg, lean, roasted
172491 Lamb loin, lean, raw
172492 Lamb loin, lean, broiled
169451 Beef liver
171098 Turkey breast
171505 Ground turkey
175176 Tilapia, raw|jalebi fish|tilapia
175177 Tilapia, cooked
175179 Shrimp (prawns), raw|prawns|jhinga|chemmeen|era
175180 Shrimp (prawns), cooked|prawns|jhinga
173686 Salmon, Atlantic, raw|salmon
171998 Salmon, Atlantic, cooked|salmon
171986 Tuna, light, canned in water|canned tuna
173708 Tuna, light, canned in oil|canned tuna
175119 Mackerel, Atlantic|bangda|bangude|ayala|mackerel
175120 Mackerel, Atlantic, cooked|bangda|bangude|ayala
175122 King mackerel (surmai)|surmai|seer fish|vanjaram|neymeen|anjal
174236 King mackerel (surmai), cooked|surmai|seer fish|vanjaram
175139 Sardines, canned in oil|mathi|chaala|pedvey
174182 Anchovy|nethili|kozhuva|anchovies
171955 Cod
174204 Crab|kekda|nandu|njandu
174208 Lobster
174223 Squid|calamari|koonthal
171982 Squid, fried|calamari
174216 Mussels|kallummakkaya
174214 Clams|tisrya|kakka
174219 Oysters
173912 Puffed rice cereal|puffed rice
171646 Granola|muesli (granola style)
168872 Oat bran
168879 White rice, medium-grain, raw
168880 White rice, medium-grain, cooked
168882 White rice, short-grain, cooked
169707 Parboiled rice, raw|ukda chawal|puzhungal arisi|boiled rice (parboiled)
169708 Parboiled rice, cooked|ukda chawal|puzhungal arisi
169709 Instant rice, dry
169742 Rice noodles, dry|rice vermicelli|sevai|idiyappam noodles
168908 Somen noodles, dry
168906 Soba noodles, dry
169699 Couscous, dry
170682 Amaranth grain (rajgira)|rajgira|ramdana|amaranth seeds
170683 Amaranth grain, cooked|rajgira
169716 Sorghum grain (jowar)|jowar|jonna|cholam
168943 Sorghum flour (jowar atta)|jowar atta|jowar flour
169739 Barley flour|jau ka atta
168885 Rye flour
169741 Oat flour
170685 Buckwheat groats, roasted, dry|kuttu
169721 Durum wheat
169725 Wheat, sprouted
169723 Cake flour
168896 Bread flour
168901 Fresh egg pasta, cooked
169701 Hominy, canned
169697 Cornmeal, whole-grain, yellow|makki ka atta|maize flour|corn meal
172422 Lima beans, baby, boiled
174255 Lima beans, baby, dry
174252 Lima beans, large, dry
174253 Lima beans, large, boiled
172425 Moth beans, dry|matki|moth|mataki
172426 Moth beans, boiled|matki
175208 Catjang cowpeas, dry
175210 Hyacinth beans, dry|val|avarekalu|sem ke beej|mochai
175211 Hyacinth beans, boiled|val|avarekalu
175205 Fava beans, dry|bakla
173753 Fava beans, boiled
175202 White beans, dry|safed rajma|white kidney beans
175203 White beans, boiled|safed rajma
175190 Great northern beans, dry
175191 Great northern beans, boiled
173748 Pink beans, dry
175186 Black turtle beans, dry
172442 Miso
172443 Natto
172451 Tofu, fried|fried tofu
174276 Soy protein isolate|soy protein powder
174273 Soy flour, full-fat|soya atta
174275 Soy flour, defatted|soya flour
167573 Ice cream, vanilla, premium
167577 Orange sherbet
167996 Halva (sesame)|halvah|tahini halva
167995 Marshmallows
168782 Rice pudding
170277 Agave syrup
168841 Caramel sauce|butterscotch sauce
169620 Vanilla frosting
168795 Chocolate frosting
169060 Nougat with almonds
169576 Chocolate-coated raisins
168001 Chocolate-coated peanuts
170656 Sugar-coated almonds|dragees
170281 Tamarind candy|imli candy|imli goli
169588 Sesame brittle|til chikki|til patti|ellu mittai
169578 Pancake syrup
167552 Caramel popcorn
167960 Cheese popcorn
167963 Potato chips, sour cream and onion
167962 Potato chips, barbecue
167559 Tortilla chips, nacho cheese
167949 Cheese puffs
167961 Pork rinds
168854 Potato sticks
168865 Taro chips|arbi chips
173150 Bagel chips
173160 Prawn crackers|shrimp chips
173157 Wasabi peas
170653 Sesame sticks
167968 Trail mix, tropical
167543 Granola bar, almond
167951 Crisped rice bar
170918 Caraway seeds|shahi jeera|kala jeera
170920 Celery seeds|ajmud
170925 Dill seeds|suva|shepu
170927 Mace|javitri
170928 Marjoram
170933 White pepper|safed mirch
170935 Sage
171315 Allspice
171316 Anise seeds|aniseed|vilayati saunf
172233 Dill leaves|suva bhaji|shepu
172238 Capers
172239 Mint, dried|dried pudina
173470 Thyme, fresh
173473 Rosemary, fresh
173474 Peppermint, fresh
171869 Tonic water
171871 Root beer
173205 Lemon-lime soda|clear soda
171942 Rice milk, unsweetened
168751 Almond milk, sweetened vanilla
173180 Protein powder, whey based
173181 Protein powder, soy based
173226 Vanilla milkshake (fast food)|milkshake
173232 Herbal tea, brewed|tisane
173230 Instant tea powder, unsweetened
173176 Dessert wine
173665 Coffee liqueur
173199 Cream soda
168750 Pina colada
169573 Daiquiri
173662 Whiskey sour
170190 Chestnuts, roasted
170575 Chestnuts, raw
170188 Pumpkin seeds, whole, roasted
169407 Watermelon seeds (magaz)|magaz|tarbooj ke beej|melon seeds
170572 Cashews, oil roasted|fried cashews|kaju
170375 Beet greens|chukandar ke patte
169991 Swiss chard
168412 Endive
170392 Kimchi
170061 Turnip greens|shalgam ke patte
169303 Sweet potato leaves|shakarkandi saag
169272 Pumpkin leaves|kaddu ke patte|mathan elai
169270 Pumpkin flowers|kaddu ke phool|squash blossoms
169382 Enoki mushrooms
168423 Morel mushrooms|guchhi|gucchi
170402 Chayote (chow chow)|chow chow|bangalore brinjal|seemebadanekai
170403 Chayote, boiled|chow chow
169244 Bathua (lambsquarters)|bathua|chenopodium|chakvat|lambsquarters
169274 Purslane (kulfa)|kulfa|luni|ghol|purslane
168419 Jute leaves (pat saag)|pat shak|nalita|jute leaves
168459 Sesbania flowers (agathi)|agathi poo|hadga|agase hoovu
168490 Arrowroot|ararot
170073 Jicama (yam bean)|mishrikand|sankalu|shakarkand (yam bean)
171714 Breadfruit|kadachakka|bread fruit
167754 Pomelo|chakotra|bombilimas
169913 Mulberries|shahtoot|shehtoot
169202 Amaranth leaves, boiled|chaulai
169770 Macaroni and cheese|mac and cheese
"""


def _parse_force(raw):
    out = {}
    for line in raw.strip().splitlines():
        fid, rest = line.split(" ", 1)
        parts = rest.split("|")
        out[fid] = (parts[0].strip(), [a.strip() for a in parts[1:] if a.strip()])
    return out


FORCE = _parse_force(FORCE_RAW)
NAME_OVERRIDES: dict[str, str] = {k: v[0] for k, v in FORCE.items()}
ALIAS_OVERRIDES: dict[str, str] = {k: "|".join(v[1]) for k, v in FORCE.items() if v[1]}

# extra junk / obscure items spotted while reviewing the output
EXTRA_DROP = re.compile(
    r"(^game meat, (?!goat)|^veal|^dove|^ruffed grouse|^canada goose|^mollusks, snail|^turtle|^frog legs|"
    r"gefiltefish|carcass|sandwich steaks|meat extender|soy protein|soy meal|soy flour, (?:low-fat|defatted)|"
    r"liver cheese|lebanon bologna|bacon and beef sticks|loaf, baked|pre-basted|liquid from stewed|"
    r"frijoles|chili beans, barbecue|with omega-3|vitamin and mineral fortified|reduced sugar|"
    r"salmon nuggets|total can contents|solids with bone and liquid|canned, liquid|trout, brook|"
    r"turkey sticks|peanut spread|hydrolyzed|soybean, curd cheese|soymilk, (?:lowfat|nonfat|chocolate)|"
    r"adzuki beans, canned, sweetened|canned with pork|beans, baked, canned, with (?:beef|franks|pork and sweet)|"
    r"george weston|thomas|pastelitos|gamesa|la moderna|andrea's|mary's gone|sage valley|keikitos|"
    r"pan dulce|bollilo|bolillo|latino bakery|tart, breakfast|saltines, fat-free|whole grain white|"
    r"calcium-fortified|calcium propionate|oat bran|sugar free|sugar-free|no sugar added|lower fat|"
    r"\blow-fat\b|\bfat-free\b|\bfat free\b|nonfat milk, sweetened|cream puff shell|mince pie|"
    r"coffeecake|crumbs bread|^(?:bread|rolls|bagels|crackers|english|muffins?|cookies|cake|pie)\b.*toasted|"
    r"confectioner's coating|pectin|gelatins, dry|fruit snacks, with high|gum drops, no sugar|"
    r"dietetic|low calorie|milk dessert, frozen|caramels, chocolate-flavor roll|coated fondant|"
    r"honey-combed|baking chocolate, mexican|^candies, carob|soft fruit and nut squares|"
    r"fudge, (?:chocolate marshmallow|vanilla|peanut butter)|jellies, reduced|sweetened with fruit juice|"
    r"\bfortified\b|high caffeine|ginseng|powerade|propel|acai|whiskey sour|3% (?:fruit )?juice|"
    r"reduced calorie|juice drink light|drink, light|juice, light|half the caffeine|instant, decaffeinated|"
    r"distilled water|kiwi strawberry|aloe vera|non-alcoholic wine|clam and tomato|fast-food cola|"
    r"orange-flavor drink|cocoa mix|chocolate powder|chocolate drink|tropical punch|iced coffee|"
    r"breakfast blend|lemonade-flavor drink|lemonade, powder|gluten- free|barbecue-flavor|"
    r"corn-based, extruded, cones|wasabi-flavored|rice cakes, brown rice, (?:buckwheat|rye|corn|multigrain|sesame)|"
    r"fruit-filled, nonfat|chewy, reduced|dry, mix|dry, powder|, dry$|powder, dry|mix, dry|cubed|"
    r"\bchunky\b|single brand|shark fin|sofrito|salsa con queso|dip, bean|fish broth|alfredo mix|"
    r"cheese sauce mix|lentil with ham|with potato and cheese|mature red, canned|duck sauce|stock, (?:beef|chicken)|"
    r"^soup, stock|dessert topping|reddi wip|lactose reduced|no sodium added|cottage, (?:creamed, with fruit|with vegetables|lowfat, 1% milkfat, with)|"
    r"10 grams protein|11g protein|9 g protein|milk, producer|imitation|cheese substitute|"
    r"ice cream, lowfat|light ice cream|ice cream, bar or stick|ice cream bar|sundae cone|"
    r"low-sodium|with vitamin|natreon|made with tofu|mayonnaise-like|poppyseed dressing|"
    r"cottonseed, oil, home|oil, corn, peanut, and olive|palm kernel|fat, (?:goose|turkey|chicken)|"
    r"beef tallow|spread, \d|margarine spread|margarine,spread|vegetable oil-butter spread|"
    r"buttermilk, lite|caesar, (?:fat|low)|green goddess|apple juice, .*calcium, and potassium|"
    r"candied fruit|melon balls|guava sauce|prune puree|raspberry juice concentrate|"
    r"raspberries, puree|juice, apple, grape and pear|sulfured|dehydrated, or banana powder|"
    r"grapefruit, raw, (?:pink and red|white), (?:california|florida)|oranges, raw, (?:california|florida|navels|with peel)|"
    r"pears, raw, (?:bartlett|bosc|red anjou|green anjou)|pineapple, raw, (?:extra sweet|traditional)|"
    r"avocados, raw, (?:california|florida)|apples, raw, (?:fuji|gala|golden|granny|red delicious)|"
    r"persimmons, native|heavy syrup pack|frozen, (?:red, )?sweetened|spiced, canned|"
    r"passion-fruit juice|cranberry-orange relish|currants|goji|pie fillings|tomato products|"
    r"au gratin|scalloped|o'brien|granules|flakes without milk|as purchased|cottage-cut|shoestring|"
    r"steak fries|crinkle|hash brown, refrigerated|hash brown, frozen|potatoes, raw, skin|"
    r"potato puffs|potato flour|corn pudding|tree fern|salsify|jerusalem-artichokes|welsh|"
    r"young green, tops|freeze-dried|harvard|japanese style|hawaiian style|pickle relish|"
    r"chowchow|kimchi|beet greens|broccoli, (?:flower clusters|leaves|stalks)|cabbage, common|"
    r"cabbage, mustard|cauliflower, green|chard|celeriac|chayote|escarole|endive|grape leaves|"
    r"hearts of palm|rutabagas|succotash|taro shoots|taro, tahitian|sweet potato leaves|"
    r"pumpkin (?:flowers|leaves)|turnip greens|waterchestnuts|wasabi, root|radishes, (?:white icicle|hawaiian)|"
    r"yeast extract|seaweed, irishmoss|tomatillos|tomato powder|mushrooms, (?:morel|maitake|chanterelle|enoki|straw|canned)|"
    r"squash, winter, (?:hubbard|acorn|spaghetti)|squash, summer, (?:scallop|crookneck|all varieties)|"
    r"hungarian|pasilla|ancho|hot chile, sun-dried|peppers, sweet, (?:red|green), (?:canned|freeze|sauteed)|"
    r"pepper, banana|nuts, walnuts, (?:black|glazed)|almonds, (?:honey roasted|oil roasted)|"
    r"coconut (?:cream|meat), (?:canned|sweetened|toasted|creamed)|coconut meat, sweetened|coconut milk, frozen|"
    r"sesame butter, (?:paste|tahini, from)|sesame seed kernels|pine nuts, pinyon|filberts, blanched|"
    r"cashew nuts, oil roasted|pecans, oil roasted|mixed nuts, oil roasted|sunflower seed kernels, (?:toasted|oil roasted)|"
    r"almond paste|chicken, skin|chicken dark meat, fried|chicken (?:breast|thigh|wing|drumstick), .*fried, batter|"
    r"breaded, battered|breast tenders|turkey, whole, (?:light|dark)|turkey, dark meat|"
    r"chicken, broilers or fryers, (?:dark|light) meat|ground turkey, fat free|patties, broiled|"
    r"turkey, (?:all classes, )?(?:gizzard|liver)|chicken, (?:gizzard|heart)|duck, domesticated, meat and skin|"
    r"ground beef, .*(?:patty|loaf)|beef, ground, .*(?:patty|loaf)|beef, ground, unspecified|"
    r"pork, cured, bacon, (?:rendered|pre-sliced)|canadian bacon|pork, fresh, backribs|pork, fresh, loin, backribs|"
    r"ground pork, (?:72|96|84)%|pork, fresh, ground, \d|\(chops\).*(?:braised|pan-fried|broiled)|"
    r"clam, (?:cooked, breaded|canned)|oyster, eastern|shrimp, (?:imitation|canned|mixed species)|"
    r"scallop, imitation|crab, blue, (?:canned|crab cakes)|herring, atlantic, (?:kippered|pickled)|"
    r"salmon, (?:pink|sockeye|coho), canned, (?:without|drained|solids)|cod, atlantic, canned|"
    r"fish sticks|shark|bluefish|monkfish|tuna, (?:bluefin|skipjack)|"
    r"catfish, channel, cooked, breaded|trout, (?:mixed|cooked)|mollusks, clam, mixed species, canned|"
    r"honey roll|beef bologna, low|italian salami|salami, cooked, turkey|meat frankfurter|ham, minced|"
    r"papad|tofu, fried|miso|refried beans, canned, (?:fat|traditional)|original and vanilla soymilk|"
    r"chinese noodles, cellophane|soybeans, (?:roasted|dry roasted)|soy flour|soy sauce made from soy$|"
    r"peanut butter, (?:smooth, reduced|chunk style)|peanuts, oil-roasted|navy beans|pinto beans, canned|"
    r"chickpeas .*canned, drained, rinsed|kidney beans, .*rinsed|kidney beans, all types, mature seeds, canned|"
    r"beans, baked, home|cowpeas, common .*canned|dry roasted, with peanuts)",
    re.I,
)
EXTRA_DROP2 = re.compile(
    r"(whipped topping|monterey, low|cream, low fat|scrambled, frozen|frozen, pasteurized|yolk, frozen|"
    r"milk shakes|yogurt, vanilla|milk dessert bar|yogurt, frozen|ice creams?, light|ice cream cookie sandwich|"
    r"ice cream cone, chocolate covered|evaporated, 2%|evaporated, nonfat|queso seco|queso blanco|"
    r"cheese, low fat|sour cream, (?:reduced|light)|cream, sour, reduced|parmesan, (?:dry grated, reduced|shredded)|"
    r"half and half, lowfat|cultured, reduced fat|milk, chocolate, (?:lowfat|reduced)|without added vitamin|"
    r"nonfat milk solids|buttermilk, dried|spray-style|sandwich spread|dressing, .*reduced fat|mayonnaise.*reduced fat|"
    r"mayonnaise-type|mayonnaise, soybean oil|mayonnaise.*light|margarine, regular, 80% fat, composite, stick|"
    r"margarine, regular, 80% fat, stick|salad or cooking, and cottonseed|vegetable, soybean, refined|"
    r"sunflower, linoleic, \(less|reduced fat|\blowfat\b|low fat, baked|ready -to-heat, toasted|frankfurter, low fat|sweet and sour dressing|salad dressing, sweet and sour|russian dressing|smoked, bone removed|"
    r"canned, with broth|pate de foie|glazed, barbecue|chicken patty|turkey and gravy|fried, flour|"
    r"fried, batter|^chicken.*stewed|turkey, whole, light meat|bean with pork|split with ham|beef noodle|"
    r"chicken broth soup, canned|bouillon|broth cubes|cheese soup|mushroom gravy|turkey gravy|"
    r"white sauce, thin|enchilada sauce|steak sauce|duck sauce|peppers, hot, immature green|horseradish sauce|"
    r"cocktail sauce|sweet and sour sauce, prepared|frankfurter, low fat|bologna, low fat|^veal|chicken bologna|"
    r"frankfurter, meat$|chicken breast, roll|salami, cooked, beef$|presweetened|with marshmallows|"
    r"frosted puffed corn|lemon peel|orange peel|heavy syrup|syrup pack|dried \(prunes\), stewed|rhubarb, frozen|"
    r"maraschino|casaba|muscadine|american type|raisins, seeded|fruit salad|juice blend|not from concentrate|"
    r"orange juice, canned|orange-grapefruit|tangerine juice|grapefruit juice, white, canned|blackberry juice|"
    r"cherry juice|orange pineapple juice|apples, frozen|apples, raw, without skin, cooked|plantains, yellow, baked|"
    r"guavas, strawberry|figs, dried, stewed|grapefruit, raw, (?:pink and red|white), all areas|"
    r"frozen, unsweetened|cherries, sour, red, frozen|pork.*\d+% lean|country-style|backribs|leg cap|"
    r"shoulder breast|rendered fat|coconut meat, (?:creamed|sweetened|toasted|dried \(desiccated\), (?:sweetened|toasted))|"
    r"coconut cream|macadamia nuts, dry roasted|pecans, dry roasted|filberts, dry roasted|back ribs|"
    r"ribeye cap|chuck, (?:top blade|blade roast)|ribeye filet|tequila sunrise|orange juice drink|wine, cooking|"
    r"wine, light|low carb|vanilla coffee|ready-to-drink, lemon|decaffeinated|higher alcohol|meal supplement|"
    r"creme de menthe|wine, table, all|vegetable and fruit juice drink|grape juice drink|carob|iced coffee|"
    r"halibut, greenland|sablefish|fish, pike|roughy|yellowtail|smelt|croaker|bison|from kid's menu|"
    r"kids' menu|tripe soup|habichuelas|grandules|"
    r"malt beer|non-alcoholic wine|vegetable and fruit juice blend|horchata|distilled, all \(gin, rum, vodka, whiskey\) (?:86|90|94|100))",
    re.I,
)

# cosmetic name fixes applied to automatically generated names
NAME_SUBS = [
    (r", canned, prepared with equal volume water$", ", canned"),
    (r", canned, prepared with equal volume (?:low fat )?milk$", ", canned, made with milk"),
    (r",? ?prepared-from-recipe,?", ""),
    (r",? ?prepared-by-recipe,?", ""),
    (r"^Beef, variety meats and by-products, liver", "Beef liver"),
    (r"^Beef, chuck for stew", "Beef stew meat (chuck)"),
    (r"^Beef, ", "Beef "),
    (r"\.$", ""),
    (r", brewed, prepared with tap water", ", brewed"),
    (r"^Carbonated, ", ""),
    (r"^Brewed coffee", "Coffee, brewed"),
    (r", as served in restaurant", ""),
    (r"^Plantains, green, fried", "Plantain, green, fried"),
    (r"^Mango, sweetened", "Dried mango, sweetened"),
    (r"^Blueberries, sweetened", "Dried blueberries, sweetened"),
    (r"^Tart cherries, sweetened", "Dried tart cherries, sweetened"),
    (r"^Ripe olives, canned", "Olives, black, canned"),
    (r"^Olives, pickled, green", "Olives, green"),
    (r"^Lemon juice from concentrate", "Lemon juice, bottled"),
    (r"^Orange juice$", "Orange juice, packaged"),
    (r"^Rice$", "Sake (rice wine)"),
    (r"^Rose wine$", "Wine, rose"),
    (r"^Rum, 80 proof", "Rum"),
    (r"^Vodka, 80 proof", "Vodka"),
    (r"^Cereal, wheat germ, toasted", "Wheat germ, toasted"),
    (r"^Pumpkin and squash seed kernels, roasted", "Pumpkin seeds, roasted"),
    (r"^Sunflower seed kernels, dry roasted", "Sunflower seeds, roasted"),
    (r"^Hazelnuts or filberts", "Hazelnuts"),
    (r"^Milk, chocolate beverage, hot cocoa", "Hot cocoa, made with milk"),
    (r"^Milk, chocolate$", "Chocolate milk"),
    (r"^Coffee, brewed, espresso, restaurant-prepared", "Espresso"),
    (r"^Soup, ", ""),
    (r" soup soup", " soup"),
    (r"^Chili sauce, ", "Chili sauce, "),
    (r"^80% fat margarine, composite, tub", "Margarine"),
    (r"^Red tomatoes, ripe, ", "Tomatoes, "),
    (r"^Desserts, ", ""),
    (r"^Hard$", "Hard candy"),
    (r"^Brownies cookies", "Brownies"),
    (r"^Frozen yogurts", "Frozen yogurt"),
    (r"^Graham crackers cookies", "Graham crackers"),
    (r"^Chocolate wafers cookies", "Chocolate wafer cookies"),
    (r"^Gingersnaps cookies", "Gingersnaps"),
    (r"^Vanilla wafers cookies, higher fat", "Vanilla wafers"),
    (r"45- 59%", "45-59%"),
    (r" cacao solids", " cacao"),
    (r"^Pound cake, other than all butter", "Pound cake"),
    (r", in-store bakery", ""),
    (r"^Yellow cake, with", "Yellow cake with"),
    (r"^Apple pie, enriched flour", "Apple pie"),
    (r"^Fruit butters, apple", "Apple butter"),
    (r"^Jams and preserves, apricot", "Apricot jam"),
    (r"^Jellies$", "Fruit jelly"),
    (r"^Cowpeas$", "Black-eyed peas, fresh"),
    (r"^Cowpeas, boiled", "Black-eyed peas, fresh, boiled"),
    (r"^Cowpeas, frozen, boiled", "Black-eyed peas, frozen, boiled"),
    (r"^Cowpeas, young pods with seeds", "Cowpea pods"),
    (r"^Dehydrated flakes onions", "Onion flakes, dehydrated"),
    (r"^Brown mushrooms, Italian, or crimini", "Cremini mushrooms"),
    (r"^Corn-based, extruded, chips", "Corn chips"),
    (r"^Standard snack-type crackers", "Snack crackers"),
    (r"^Cheeseburger; single, regular patty, with condiments and vegetables", "Cheeseburger with condiments and vegetables"),
    (r"^English muffin, with ca prop", "English muffin"),
    (r"^Ready-to-bake or -fry tortilla, (.+)$", r"Tortilla, \1"),
    (r"^Crumbs bread, dry, grated", "Bread crumbs, dry"),
    (r"^Sticks bread", "Breadsticks"),
    (r"^Chinese noodles, cellophane or long rice, dehydrated", "Glass noodles (cellophane), dry"),
    (r"^Snap beans, green, frozen, boiled, drained without salt", "Snap beans, green, frozen, boiled"),
    (r"^Vegetables, mixed, canned", "Mixed vegetables, canned"),
    (r"^Vegetables, mixed, frozen, boiled", "Mixed vegetables, frozen, boiled"),
    (r"^Red tomatoes, ripe$", "Tomatoes, ripe"),
    (r'^Pizza chain, 14" pizza, (.+?) topping, (.+)$', r"\1 pizza, \2"),
    (r"^Restaurant, ([A-Za-z ]+?), (.+?)(?:, entree)?$", r"\2 (\1 restaurant)"),
    (r"\(family style restaurant\)", "(restaurant)"),
]
FORCE_DROP: set[str] = set()
# generated names that are still junk / duplicates after the rules above
DROP_NAMES = {
    "Mckee baking, little debbie nutty bars, wafers with peanut butter, chocolate covered",
    "Whole-wheat bread", "White wheat bread", "Pancake, reduced fat", "Egg, yolk, frozen, sugared, pasteurized",
    "80% fat margarine, stick", "Soybean oil, salad or cooking", "Soybean oil, salad or cooking, and cottonseed",
    "Sunflower oil, linoleic", "Chili beans, barbecue, ranch style, cooked", "Soymilk", "Soymilk, lowfat",
    "Soymilk, nonfat", "Pork, pickled pork hocks", "Veal bratwurst, cooked", "Chicken bologna, pork",
    "Beef bologna, low fat", "Chicken, canned, with broth", "Turkey, canned, with broth",
    "Turkey drumstick, smoked, with skin, bone removed", "Turkey wing, smoked, with skin, bone removed",
    "Coconut meat, creamed", "Cheese crackers, reduced fat", "Whole-wheat crackers, reduced fat",
    "Sandwich-type crackers, peanut butter filled, reduced fat", "Cheese puffs and twists, corn based, baked, low fat",
    "Tortilla chips, low fat, baked without fat", "Potato chips, reduced fat", "Desserts, rennin, tablets",
    "Fruit flavored syrup", "Balsam-pear, leafy tips, boiled", "Radish, oriental", "Vegetables, mixed canned",
    "Potato, baked, skin", "Brownies cookies, reduced fat", "Chocolate sandwich cookies, with creme filling, reduced fat",
    "Oatmeal cookies, reduced fat", "Shortbread cookies, reduced fat", "Graham crackers cookies, plain or honey, lowfat",
    "Black tea", "Green tea", "Grapefruit juice, pink", "Milk, chocolate, reduced fat", "Cheese soup, canned",
    "Cheese soup, canned, made with milk", "Chicken broth soup, canned", "Pumpkin pie mix, canned",
    "Oats", "Dinner rolls, sweet", "Rennin, tablets", "Cake-type doughnut", "Chicken, fried", "Duck, with skin",
}


def cap_first(s: str) -> str:
    s = s.strip()
    return s[:1].upper() + s[1:] if s else s


def fix_case(s: str) -> str:
    words = s.lower().split(" ")
    out = []
    for w in words:
        core = w.strip(",()")
        if core in PROPER:
            w = w.replace(core, PROPER[core])
        out.append(w)
    return cap_first(" ".join(out))


def friendly(desc: str) -> tuple[str, list[str]]:
    d = desc
    d = re.sub(r"\s*\((?:[Ii]ncludes|include|Includes)[^)]*\)", "", d)
    d = re.sub(r",?\s*with(?:out)? added (?:nonfat milk solids,? ?)?(?:and )?(?:vitamins?|ascorbic|calcium|nutrients|potassium)[^()]*", "", d, flags=re.I)
    d = re.sub(r",?\s*with added nonfat milk solids", "", d, flags=re.I)
    aliases: list[str] = []
    for m in re.findall(r"\(([^()]*)\)", d):
        if re.search(r"\d|NLEA|type|portion|and |sum of|made|kernels|leaf|liquid|excluding", m, re.I):
            continue
        for a in re.split(r",| or ", m):
            a = a.strip().lower()
            if 2 < len(a) < 30:
                aliases.append(a)
    d = re.sub(r"\s*\([^()]*\)", "", d)
    d = d.replace("--", ",")
    parts = [p.strip() for p in d.split(",") if p.strip()]
    low = [p.lower() for p in parts]

    # prefix rewrites
    if low[0] == "alcoholic beverage" or low[0] == "alcoholic beverages":
        parts, low = parts[1:], low[1:]
        if low and low[0] == "distilled":
            parts, low = parts[1:], low[1:]
    if low[0] == "cereals ready-to-eat":
        parts[0], low[0] = "cereal", "cereal"
    if low[0] in ("nuts", "seeds", "spices", "fish", "crustaceans", "mollusks", "snacks",
                  "snack", "beverages", "candies", "fast foods", "fast food", "cereals") and len(parts) > 1:
        parts, low = parts[1:], low[1:]
    # poultry & meats: "Chicken, breast" -> "Chicken breast"
    if low[0] in ("chicken", "turkey", "duck", "beef", "pork", "lamb", "goat") and len(parts) > 1:
        head = low[0]
        rest = [p for p in low[1:] if (p not in DROP_PARTS or p == "with skin") and not DROP_PART_RE.match(p)]
        rest = [p for p in rest if p not in ("fresh", "cured", "retail cuts", "whole")]
        cuts = []
        while rest and (rest[0] in CUTS or any(rest[0].endswith(c) for c in CUTS) or
                        rest[0] in ("top round", "bottom round", "eye of round", "loin", "rib",
                                    "tenderloin", "short loin", "center loin", "leg", "ham",
                                    "shoulder", "arm", "blade", "spareribs", "roast", "steak",
                                    "roasts", "chops", "top loin", "sirloin", "ground")
                        or rest[0].startswith("leg ") or rest[0].startswith("center ")):
            cuts.append(rest.pop(0))
        # drop cuts contained in later cuts
        cuts = [c for i, c in enumerate(cuts) if not any(c in later for later in cuts[i + 1:])]
        if cuts and cuts[0] == "ground":
            name = f"ground {head}" + (" " + " ".join(cuts[1:]) if cuts[1:] else "")
        elif cuts:
            name = f"{head} {' '.join(cuts)}"
        else:
            name = head
        rest2 = []
        for p in rest:
            if p == "meat and skin":
                rest2.append("with skin")
            elif p in ("separable lean only", "lean only"):
                rest2.append("lean")
            elif p == "cooked" and len(rest) > rest.index(p) + 1:
                continue
            elif p in ("dry heat", "moist heat"):
                rest2.append("cooked")
            else:
                rest2.append(p)
        rest2 = [re.sub(r"(\d+)% lean meat / (\d+)% fat", r"\1% lean", p) for p in rest2]
        rest2 = [p for p in rest2 if p not in DROP_PARTS or p == "with skin"]
        full = name + ("" if not rest2 else ", " + ", ".join(dict.fromkeys(rest2)))
        return fix_case(full), aliases

    # generic cleanup
    keep = []
    for i, p in enumerate(parts):
        lp = p.lower()
        if i > 0 and (lp in DROP_PARTS or DROP_PART_RE.match(lp)):
            continue
        keep.append(p)
    parts = keep
    low = [p.lower() for p in parts]
    # "cooked, X" -> "X"
    out = []
    for i, p in enumerate(low):
        if p == "cooked" and i + 1 < len(low) and low[i + 1] in PREP_WORDS:
            continue
        if p in ("dry heat", "moist heat"):
            p = "cooked"
        out.append(p)
    low = out
    head = low[0]
    if head in SINGULAR:
        head = SINGULAR[head]
    # inversion
    if low[0] in INVERT and len(low) > 1 and low[1] not in PREP_WORDS and len(low[1].split()) <= 3:
        noun = INVERT[low[0]]
        q = low[1]
        if noun in ("apple", "pear", "orange", "plum", "peach") :
            name = f"{noun}, {q}"
        elif noun:
            name = f"{q} {noun}" if noun not in q else q
        else:
            name = q
        rest = low[2:]
    else:
        name = head
        rest = low[1:]
    rest = [r for r in dict.fromkeys(rest) if r not in DROP_PARTS]
    full = name + ("" if not rest else ", " + ", ".join(rest))
    full = full.replace("  ", " ")
    return fix_case(full), [a for a in aliases if a not in full.lower()]


def score(desc: str) -> float:
    d = desc.lower()
    s = len(desc) / 40.0
    pen = {"canned": 2, "frozen": 3, "dehydrated": 4, "with salt": 6, "sweetened": 1,
           "syrup": 2, "cooked, boiled, drained": 0.5, "stewed": 1.5, "choice": 0.5,
           "trimmed to 1/4": 2, "trimmed to 1/8": 1, "microwaved": 3, "heated": 1, "light": 1,
           "reduced fat": 0.5, "flavor": 1, "mix": 2, "concentrate": 3, "home-prepared": 0.5,
           "prepared from recipe": 0.5, "smoked": 1, "pickled": 1, "dried": 1}
    for k, v in pen.items():
        if k in d:
            s += v
    for k in ("raw", "cooked", "roasted", "grilled", "boiled"):
        if k in d:
            s -= 0.3
    return s


# --------------------------------------------------------------------------------------
# servings, tags, veg
# --------------------------------------------------------------------------------------
FRAC = {0.25: "1/4", 0.33: "1/3", 0.333: "1/3", 0.5: "1/2", 0.67: "2/3", 0.667: "2/3", 0.75: "3/4",
        1.5: "1 1/2", 2.5: "2 1/2"}


def fmt_amount(a: str) -> str:
    try:
        v = float(a)
    except ValueError:
        return a
    if v in FRAC:
        return FRAC[v]
    if v == int(v):
        return str(int(v))
    return f"{v:g}"


def clean_modifier(m: str) -> str:
    m = re.sub(r"\s*\((?:1 NLEA serving|NLEA serving)\)", "", m)
    m = re.sub(r"\bNLEA serving\b", "serving", m)
    m = m.replace("tablespoon", "tbsp").replace("teaspoon", "tsp").replace("Tablespoons", "tbsp")
    m = re.sub(r"\s*\([^()]*(?:yield|include|approx|varied|dimensions)[^()]*\)", "", m, flags=re.I)
    if re.match(r"^serving\b.*varie", m, re.I):
        m = "serving"
    m = m.replace(" ,", ",").strip(" ,")
    return m


def servings(portions, cat):
    opts, seen = [], set()
    for p in portions:
        g = float(p["gram_weight"] or 0)
        mod = clean_modifier(p["modifier"] or p["portion_description"] or "")
        if g <= 0 or g > 1500 or not mod:
            continue
        if re.match(r"^(lb|oz|g|grams?|kg|fl oz)\b", mod, re.I) and not re.match(r"^(oz|fl oz)$", mod):
            continue
        if mod == "lb" or "yield from" in mod.lower() or "sum of" in mod.lower() or "recipe" in mod.lower():
            continue
        amt = fmt_amount(p["amount"] or "1")
        label = f"{amt} {mod}"
        if re.search(r"[A-Z]", mod):
            continue
        if len(label) > 48:
            label = label[:48].rsplit(" ", 1)[0].rstrip(",(")
        if label.count("(") != label.count(")"):
            label = label.split(" (")[0]
        key = label.lower()
        if key in seen or key == "100 g":
            continue
        seen.add(key)
        opts.append({"label": label, "grams": round(g, 1) if g != int(g) else int(g)})
    # keep oz only if nothing else
    non_oz = [o for o in opts if not re.match(r"^[\d/ ]+(oz|fl oz)$", o["label"])]
    ozs = [o for o in opts if o not in non_oz]
    if non_oz:
        opts = non_oz[:5]
        if cat in ("meat", "seafood") and ozs:
            opts.append(next((o for o in ozs if o["label"].startswith("3 oz")), ozs[0]))
    else:
        opts = ozs[:1]
    opts.append({"label": "100 g", "grams": 100})
    # default
    pri = {
        "meat": ["breast", "thigh", "drumstick", "wing", "fillet", "chop", "steak", "patty", "link",
                 "slice", "piece", "3 oz"],
        "seafood": ["fillet", "piece", "3 oz", "can"],
        "fruit": ["medium", "fruit", "cup"],
        "vegetable": ["cup", "medium", "piece"],
        "fat_oil": ["tbsp", "tsp", "pat"],
        "condiment": ["tbsp", "tsp", "packet"],
        "beverage": ["cup", "fl oz", "can", "bottle", "glass"],
        "egg": ["large", "egg", "medium"],
        "bread": ["slice", "piece", "roll", "bagel", "muffin", "tortilla", "medium", "pancake", "waffle"],
        "nut_seed": ["oz", "tbsp", "cup"],
        "sweet": ["piece", "cookie", "serving", "slice", "bar", "cup", "tbsp"],
    }.get(cat, [])
    default = None
    for word in pri:
        for o in opts[:-1]:
            if word in o["label"].lower():
                default = o["label"]
                break
        if default:
            break
    if not default:
        default = opts[0]["label"] if len(opts) > 1 and opts[0]["grams"] <= 500 else "100 g"
    return opts, default


NONVEG = re.compile(
    r"\b(chicken|turkey|duck|goose|beef|pork|lamb|mutton|goat|veal|ham|bacon|sausage|salami|bologna|"
    r"frankfurter|pepperoni|meat|meatballs|fish|salmon|tuna|cod|shrimp|prawns?|crab|lobster|clams?|"
    r"oysters?|mussels?|scallops?|squid|octopus|anchov\w*|sardines?|mackerel|herring|tilapia|trout|"
    r"catfish|haddock|halibut|pollock|egg|eggs|eggnog|mayonnaise|gelatin|lard|tallow|custard|flan|"
    r"meringue|pastrami|bratwurst|kielbasa|jerky|broth|bouillon|gravy|worcestershire|caesar|"
    r"chowder|stock|cake|cakes|muffins?|pancakes?|waffles?|brownies?|eclairs?|cream puffs?|"
    r"french toast|egg noodles|noodles, egg|marshmallows?|cheesecake|hamburger|cheeseburger|meatballs?|"
    r"steak|sirloin|hot and sour|tartar sauce|"
    r"burger|hotdog|nuggets|chili con carne|chili with meat|stew|pot pie|oyster|fish sauce|surimi|"
    r"pepperoni|anchovy|clam|mussels|octopus|squid|cuttlefish|eel|carp|bass|snapper|grouper|"
    r"mahimahi|mullet|perch|pompano|rockfish|swordfish|whitefish|whiting|butterfish|milkfish|"
    r"flatfish|lobster|crab|scallops?|tuna|cod|shrimp|prawn|salami|frankfurter|bologna|"
    r"pupusas del cerdo|empanadas, beef|tamale, pork|kung pao|general tso|egg rolls?|wonton)\b", re.I)
VEG_OK = re.compile(r"\b(eggplant|cream of mushroom|vegetable broth|vegetarian|egg-free|rice cake|"
                    r"rice cakes|corn cakes|beefsteak tomato|peanut butter cup|burger bun|"
                    r"hamburger or hot ?dog|no meat|without meat|meatless|fish-shaped|pancake syrup|"
                    r"table blends, pancake|mushroom gravy|duck sauce|cake flour|ice cream cones|"
                    r"steak sauce|wheat flour, white, cake)\b", re.I)


# final-name overrides where the keyword rules get it wrong
VEG_OVERRIDES = {"Steak sauce, tomato based": True, "Ice cream cones, cake or wafer-type": True,
                 "Tartar sauce": False, "Ice cream cones, sugar, rolled-type": True}


def is_veg(desc: str, cat: str) -> bool:
    if cat in ("meat", "seafood", "egg"):
        return False
    if re.search(r"\b(vegetarian|vegetable broth)\b", desc, re.I) and not re.search(r"beef|chicken", desc, re.I):
        return True
    d = re.sub(r"\((?:includes|include)[^)]*\)", "", desc, flags=re.I)
    d = VEG_OK.sub("", d)
    return not NONVEG.search(d)


def tags_for(desc, name, cat, n):
    d = (desc + " " + name).lower()
    t = []
    kcal, p, c, f, fib = n
    if cat == "fruit":
        t.append("fruit")
    if cat == "vegetable":
        t.append("vegetable")
    if cat == "dairy":
        t.append("dairy")
    if cat in ("grain", "rice", "bread", "breakfast"):
        t.append("grain")
    if cat == "legume":
        t.append("legume")
    if cat == "meat":
        t.append("meat")
    if cat == "seafood":
        t.append("seafood")
    if cat == "egg":
        t.append("egg")
    if cat == "snack":
        t.append("snack")
    if cat == "beverage":
        t.append("beverage")
    if cat == "sweet" or re.search(r"ice cream|pudding|\bpie\b|\bcake\b|cookies|brownie|doughnut|candies|chocolate, (dark|milk)|fudge|sherbet", d):
        t.append("dessert")
    if re.search(r"\bfried\b|french fries|potato chips|tortilla chips|doughnut|fritter|hush pupp|onion rings|corn chips|oil roasted|oil-roasted|banana chips|plantain chips|nuggets|tempura|fried, batter", d) and "stir-fried" not in d and "pan-fried" not in d:
        t.append("fried")
    if re.search(r"^fast foods?|pizza|hamburger|cheeseburger|french fries|hotdog|hot dog|nuggets|taco|burrito", desc.lower()) or re.search(r"pizza|burger|french fries", d):
        t.append("fast_food")
    if re.search(r"^alcoholic|\bbeer\b|\bwine\b|vodka|whiskey|\brum\b|\bgin\b|liqueur", desc.lower()) and "vinegar" not in d and "non-alcoholic" not in d:
        t.append("alcohol")
    if cat == "beverage" and "alcohol" not in t and c >= 5 and re.search(
            r"carbonated|cola|soda|drink|cocktail|lemonade|limeade|punch|nectar|sweetened|energy|sports|iced tea|tea, (?:black|green), ready", d) \
            and not re.search(r"unsweetened|milk", d):
        t.append("sugary_drink")
    if kcal > 0 and (p >= 20 or (p * 4) / kcal >= 0.30):
        t.append("high_protein")
    if fib >= 6:
        t.append("high_fibre")
    return list(dict.fromkeys(t))


def energy_ok(kcal, p, c, f, fib):
    est = 4 * p + 4 * max(c - fib, 0) + 2 * fib + 9 * f
    return abs(kcal - est) <= max(0.15 * est, 8)


def r1(x):
    v = round(float(x) + 1e-9, 1)
    return int(v) if v == int(v) else v


# --------------------------------------------------------------------------------------
def main():
    ensure_data()
    foods = {r["fdc_id"]: r for r in read("food.csv")}
    nut = defaultdict(dict)
    wanted = {N_KCAL, N_KCAL_GEN, N_KCAL_SPEC, N_PROT, N_FAT, N_CARB, N_FIBRE, N_SUGAR, N_ALC}
    for r in read("food_nutrient.csv"):
        if r["nutrient_id"] in wanted and r["fdc_id"] in foods:
            nut[r["fdc_id"]][r["nutrient_id"]] = float(r["amount"] or 0)
    portions = defaultdict(list)
    for r in read("food_portion.csv"):
        portions[r["fdc_id"]].append(r)
    for v in portions.values():
        v.sort(key=lambda r: (int(r["seq_num"] or 0), int(r["id"])))

    cap_re = re.compile(r"\b[A-Z][A-Z'&\.\-]{2,}\b")
    stats = defaultdict(int)
    why = {}
    cands = []
    for fid in sorted(foods, key=int):
        f = foods[fid]
        desc = f["description"]
        cid = f["food_category_id"]
        if cid not in CATS:
            continue
        if fid in FORCE_DROP:
            stats["force_drop"] += 1
            continue
        forced = fid in FORCE
        if not forced and ([m for m in cap_re.findall(desc) if m not in BRAND_OK] or BRAND_WORDS.search(desc)):
            stats["brand"] += 1
            why[fid] = "brand"
            continue
        if not forced and (DROP.search(desc) or OBSCURE.search(desc) or EXTRA_DROP.search(desc)
                           or EXTRA_DROP2.search(desc)):
            stats["rule_drop"] += 1
            why[fid] = "DROP" if DROP.search(desc) else ("OBSCURE" if OBSCURE.search(desc) else "EXTRA")
            continue
        n = nut[fid]
        kcal = n.get(N_KCAL, n.get(N_KCAL_GEN, n.get(N_KCAL_SPEC)))
        if kcal is None:
            stats["no_energy"] += 1
            continue
        p, c, fat, fib = (n.get(N_PROT, 0.0), n.get(N_CARB, 0.0), n.get(N_FAT, 0.0), n.get(N_FIBRE, 0.0))
        if kcal > 900 or p + c + fat > 100:
            stats["out_of_range"] += 1
            why[fid] = "range"
            continue
        is_alcohol = bool(re.match(r"alcoholic", desc, re.I))
        if not is_alcohol and not energy_ok(kcal, p, c, fat, fib):
            stats["energy_mismatch"] += 1
            why[fid] = "energy"
            continue
        cat = CATS[cid][0]
        for rx, c2 in CAT_ADJUST:
            if rx.search(desc):
                cat = c2
                break
        if fid in NAME_OVERRIDES:
            name, aliases = NAME_OVERRIDES[fid], []
        else:
            name, aliases = friendly(desc)
        if fid in ALIAS_OVERRIDES:
            aliases = ALIAS_OVERRIDES[fid].split("|") + aliases
        if not forced:
            for rx, rep in NAME_SUBS:
                name = re.sub(rx, rep, name)
            name = fix_case(name.strip().rstrip(","))
        name = name.strip().rstrip(",")
        if not forced and name in DROP_NAMES:
            stats["name_drop"] += 1
            why[fid] = "name_drop"
            continue
        cands.append(dict(fid=fid, desc=desc, cid=cid, cat=cat, name=name, aliases=aliases,
                          n=(kcal, p, c, fat, fib), score=score(desc) - (100 if forced else 0)))

    # dedupe by friendly name (keep best score)
    best = {}
    for cnd in sorted(cands, key=lambda x: (x["score"], int(x["fid"]))):
        key = cnd["name"].lower()
        if key in best:
            stats["dup_name"] += 1
            why[cnd["fid"]] = "dup:" + cnd["name"]
            continue
        best[key] = cnd
    # per-USDA-category caps
    bycat = defaultdict(list)
    for cnd in best.values():
        bycat[cnd["cid"]].append(cnd)
    chosen = []
    for cid, lst in bycat.items():
        lst.sort(key=lambda x: (x["score"], len(x["name"]), int(x["fid"])))
        capn = CATS[cid][1]
        forced = [x for x in lst if x["fid"] in NAME_OVERRIDES]
        rest = [x for x in lst if x["fid"] not in NAME_OVERRIDES]
        take = forced + rest[: max(0, capn - len(forced))]
        stats["over_cap"] += len(lst) - len(take)
        for x in lst[len(take):]:
            why[x["fid"]] = "cap:" + x["name"]
        chosen += take

    rows = []
    for cnd in chosen:
        kcal, p, c, fat, fib = cnd["n"]
        opts, default = servings(portions.get(cnd["fid"], []), cnd["cat"])
        rows.append({
            "external_id": f"usda-{cnd['fid']}",
            "name": cnd["name"],
            "aliases": "|".join(dict.fromkeys(a for a in cnd["aliases"] if a and "|" not in a)),
            "category": cnd["cat"],
            "tags": "|".join(tags_for(cnd["desc"], cnd["name"], cnd["cat"], cnd["n"])),
            "veg": "true" if VEG_OVERRIDES.get(cnd["name"], is_veg(cnd["desc"], cnd["cat"])) else "false",
            "kcal": r1(kcal), "protein": r1(p), "carbs": r1(c), "fat": r1(fat), "fibre": r1(fib),
            "serving_options": json.dumps(opts, ensure_ascii=False, separators=(",", ":")),
            "default_serving": default,
        })
    rows.sort(key=lambda r: (r["category"], r["name"].lower()))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} rows to {os.path.relpath(OUT)}", file=sys.stderr)
    print("skipped:", dict(sorted(stats.items())), file=sys.stderr)
    for cnd in chosen:
        why[cnd["fid"]] = "OK:" + cnd["name"]
    if os.environ.get("USDA_DEBUG"):
        with open(os.environ["USDA_DEBUG"], "w") as f:
            for fid in sorted(foods, key=int):
                f.write(f"{fid}\t{foods[fid]['food_category_id']}\t{why.get(fid, '-')}\t{foods[fid]['description']}\n")


if __name__ == "__main__":
    main()
