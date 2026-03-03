# Ellen's Woolworths Order Analysis

orders = {
    "293177134": [
        ("Macro Firm Tofu", 1),
        ("Parker's Pretzels Kids' Lunchbox Snacks Multipack Salted", 1),
        ("Sakata Stars Rice Snack Mix Lunchbox Assorted Multipack", 1),
        ("Sunny Queen 12 Extra Large Organic Free Range Eggs", 0),  # OOS
        ("6 large organic free range [sub for eggs]", 3),
        ("Massel Stock Powder Chicken", 1),
        ("The Food Company Garlic, Ginger & Shallots", 1),
        ("Tamar Valley Dairy Kids Greek Yoghurt Pouch Strawberry", 3),
        ("Tamar Valley Dairy Kids Greek Yoghurt Pouch Vanilla", 2),
        ("Fresh Broccoli", 2),
        ("Woolworths Australian Grown Carrots", 1),
        ("Woolworths Baby Leaf Spinach Spinach", 1),
        ("Woolworths Cherry Tomatoes Punnet", 1),
        ("Woolworths Choy Sum Asian Greens", 0),  # OOS
        ("buk choy asian greens [sub for Choy Sum]", 2),
        ("Kez's Kitchen Honey Joy", 1),
        ("Macro Satay Tofu", 2),
        ("Table Of Plenty Mini Rice Cakes Milk Chocolate", 1),
        ("Wokka Udon Noodles", 2),
        ("Woolworths Health Smart Extra Lean Diced Beef", 1),
    ],
    "293028339": [
        ("Nudie Nothing But 2 Apples Juice", 4),
        ("Nudie Nothing But Apple & Strawberry Juice", 4),
        ("Creative Gourmet Frozen Mango Chunks", 1),
        ("Creative Gourmet Frozen Pineapple Pieces", 1),
        ("Macro Organic Frozen Mixed Berries", 1),
        ("Woolworths Frozen Strawberries", 1),
        ("Apple Sundowner", 2),
        ("Cavendish Bananas", 2),
        ("Eat Later Cavendish Bananas", 2),
        ("Fresh Broccoli", 2),
        ("Plum Croc Eggs Loose", 6),
        ("Queen Garnet The Antioxidant Plum", 0),  # OOS
        ("plum croc eggs loose [sub]", 6),
        ("Sweet Potato Gold", 2),
        ("The Odd Bunch Continental Cucumber", 2),
        ("Woolworths Baby Leaf Spinach Spinach", 1),
        ("Woolworths Blue Washed Potato Bag", 1),
        ("Woolworths Fresh Green Cabbage Half", 1),
        ("Resolv Laundry Detergent Sheets Fresh Ocean", 2),
        ("Macro Free Range Chicken Drumsticks Free Range", 2),
    ],
    "292871019": [
        ("Essentials White Vinegar", 1),
        ("Mutti Tomato Paste Double Concentrate", 1),
        ("Brancourts Low Fat Cottage Cheese", 1),
        ("Tamar Valley Dairy Kids Greek Yoghurt Pouch Vanilla", 5),
        ("Nestle Carnation Lite Cooking Cream", 1),
        ("Woolworths Frozen Australian Peas", 1),
        ("Apple Sundowner", 3),
        ("Fresh Broccoli", 1),
        ("Iceberg Lettuce", 1),
        ("Plum Croc Eggs Loose", 4),
        ("Queen Garnet The Antioxidant Plum", 4),
        ("The Odd Bunch Continental Cucumber", 2),
        ("Woolworths Baby Leaf Spinach Spinach", 1),
        ("Woolworths Blue Washed Potato Bag", 1),
        ("Yellow Flesh Nectarines", 6),
        ("The Kimchi Company Vegan", 1),
        ("Bosisto's Bathroom & Shower Cleaner", 1),
        ("Easy-Off Bam Bathroom Bleach Cleaning Spray", 1),
        ("Essentials Non-Scratch Sponge Scourers Scourers", 2),
        ("Armada Large Kitchen Tidy Bag Lavender/Lemon Scented", 1),
        ("Churu Sprinkles Cat Treats Chicken", 1),
        ("Smitten Cat Milk", 1),
        ("Temptations Cat Treats Tasty Chicken Flavour", 1),
        ("Temptations Tantalising Turkey Cat Treats", 1),
    ],
    "292278956": [
        ("Nana Traditional Lebanese Bread White", 0),  # OOS
        ("wraps [sub for Lebanese bread]", 1),
        ("Nana Traditional Lebanese Bread Wholemeal", 0),  # OOS
        ("Macro Organic Soy Long Life Milk UHT", 4),
        ("McCain Corn Kernels", 1),
        ("Eat Later Cavendish Bananas", 2),
        ("Kale Fresh Bunch", 1),
        ("Red Capsicum", 2),
        ("Woolworths Fresh Herb Coriander Bunch", 1),
        ("Woolworths Qukes Baby Cucumbers Punnet", 1),
        ("Yellow Flesh Nectarines", 6),
        ("Betadine Sore Throat Gargle Ready To Use", 1),
        ("Nestle Butter-Menthol Throat Lozenges", 1),
        ("The Kimchi Company Vegan", 1),
        ("La Costena Refried Pinto Beans", 1),
        ("Old El Paso Taco Spice Mix", 1),
        ("Woolworths RSPCA Approved Chicken Mince", 1),
        ("Armada Large Kitchen Tidy Bag Lavender/Lemon Scented", 1),
    ],
    "291817315": [
        ("Nobby's Peanuts", 4),
        ("Woolworths Salted Mixed Nuts", 1),
        ("Weet-Bix Bites Crunchy Honey Breakfast Cereal", 1),
        ("Cocobella Coconut Water Straight Up", 1),
        ("Corn Sweet", 8),
        ("Fresh Broccoli", 1),
        ("Woolworths Australian Grown Carrots", 1),
        ("Woolworths Cherry Tomatoes Punnet", 1),
        ("Woolworths Choy Sum Asian Greens", 0),  # OOS
        ("buk choy asian greens [sub for Choy Sum]", 1),
        ("Woolworths Qukes Baby Cucumbers Punnet", 2),
        ("Woolworths White Cup Sliced Mushroom Punnet", 1),
        ("Slendier Konjac Noodle Style", 1),
        ("The Kimchi Company Vegan", 0),  # OOS
        ("Comfort Laundry Fabric Conditioner Liquid Marrakesh", 1),
        ("Comfort Laundry Fabric Conditioner Liquid Paris", 1),
        ("Comfort Laundry Fabric Conditioner Liquid Tahiti", 2),
        ("Pandaroo Thai Rice Noodles", 1),
        ("Woolworths Pork & Beef Mince", 1),
    ],
    "291654800": [
        ("Woolworths Mini Banana Muffin", 1),
        ("Macro Organic Plain Flour", 0),  # OOS
        ("plain flour [sub]", 1),
        ("Nibblish Pure Fruit Swirls Mango", 1),
        ("Uncle Tobys Muesli Bars Chewy Choc Chip", 1),
        ("Macro Organic Chickpeas", 2),
        ("Woolworths Puree In Pouch Apple & Mango", 2),
        ("Apple Sundowner", 4),
        ("Eat Later Cavendish Bananas", 4),
        ("Fresh Pink Lady Apples", 2),
        ("Honey Gold Mango Large", 2),
        ("Nectarine White Flesh", 6),
        ("Woolworths Fresh Herb Coriander Bunch", 1),
        ("Woolworths Qukes Baby Cucumbers Punnet", 1),
        ("Yellow Flesh Nectarines", 6),
        ("Swisspers Cotton Tips With Paper Stems", 1),
        ("True Fruit Apple & Strawberry Straps", 1),
        ("True Fruit Strips Mango & Apple", 1),
        ("Morning Fresh Dishwashing Liquid Lemon Super Strength", 1),
        ("Ayam 100% Natural Light Coconut Cream", 1),
        ("Patak's Korma Curry Paste", 1),
        ("Woolworths Lamb Leg Steak", 1),
    ],
    "291281396": [
        ("Ayam Vegetarian Oyster Sauce", 1),
        ("Farmers Union Greek Style Yoghurt Pouch Strawberry", 6),
        ("Farmers Union Greek Style Yogurt Pouch Real Vanilla Bean", 6),
        ("Yoplait Classics Yoghurt", 1),
        ("Bae Juice 100% Korean Pear Juice", 4),
        ("Nudie Nothing But Aloha", 0),  # OOS
        ("golden sunrise juice [sub]", 2),
        ("Juicies Watermelon", 1),
        ("Woolworths Australian Grown Carrots", 1),
        ("Woolworths Red Watermelon Cut Quarter", 1),
        ("Kez's Kitchen Honey Joy", 1),
        ("Table Of Plenty Mini Rice Cakes Milk Chocolate", 1),
        ("The Kimchi Company Vegan", 1),
        ("Lee Kum Kee Sauce Hoi Sin", 1),
        ("Smitten Crystal Cat Litter", 1),
        ("U by Kotex Extra Overnight Pads Long with Wings", 1),
        ("U by Kotex Ultrathin Pads Regular with Wings", 1),
    ],
    "291064890": [
        ("Kellogg's Rice Bubbles Breakfast Cereal", 1),
        ("Macro 12 Large Organic Australian Free Range Eggs", 1),
        ("Pascall Marshmallows Pink & White", 1),
        ("Kellogg's Corn Flakes Crumbs", 1),
        ("a2 Full Cream Milk", 1),
        ("Chobani Fit High Protein Greek Yogurt Pouch Strawberry", 2),
        ("Chobani Fit High Protein Greek Yogurt Pouch Vanilla", 4),
        ("Nuttelex Buttery Table Spread", 1),
        ("Bae Juice 100% Korean Pear Juice", 2),
        ("Macro Organic Soy Long Life Milk UHT", 1),
        ("Peters Frosty Fruits Watermelon", 1),
        ("Apple Sundowner", 4),
        ("Corn Sweet", 1),
        ("Fresh Broccoli", 2),
        ("Woolworths Red Watermelon Cut Quarter", 1),
        ("Yellow Flesh Nectarines", 4),
        ("Macro Chicken Breast Fillets Free Range", 2),
    ],
    "290914039": [
        ("Saweet Pure Allulose Natural Sweetener", 1),
        ("Bae Juice 100% Korean Pear Juice", 2),
        ("Coca-Cola Zero Sugar Soft Drink Mini Cans", 1),
        ("Macro Organic Frozen Strawberries", 1),
        ("Cavendish Bananas", 2),
        ("Eat Later Cavendish Bananas", 2),
        ("Woolworths Baby Leaf Spinach Spinach", 1),
        ("Woolworths Qukes Baby Cucumbers Punnet", 1),
        ("O'Food Korean Gochujang", 1),
        ("Woolworths Corned Beef Silverside", 1),
        ("Temptations Mix Ups Cat Treats Tuna Salmon & Shrimp", 1),
        ("Temptations Mix Ups Catnip, Chicken & Cheddar Cat Treats", 1),
    ],
    "290805995": [
        ("Weet-Bix Bites Crunchy Honey Breakfast Cereal", 1),
        ("John West Tuna Chunks In Springwater", 6),
        ("Woolworths Apple & Strawberry Puree In Pouch", 2),
        ("Massel Stock Powder Beef", 1),
        ("Chobani Greek Yogurt Passion Fruit", 1),
        ("Oat Milk Goodness Chocolate Protein Milk", 2),
        ("Pauls Low Fat Chocolate Mousse", 2),
        ("Tamar Valley Dairy Kids Greek Yoghurt Pouch Vanilla", 2),
        ("Nudie 100% Apple Juice", 1),
        ("Hong Kong Dim Sim Kitchen BBQ Pork Buns", 2),
        ("Cavendish Bananas", 2),
        ("Eat Later Cavendish Bananas", 2),
        ("Fresh Broccoli", 2),
        ("Fresh Pink Lady Apples", 4),
        ("Nectarine White Flesh", 4),
        ("Woolworths Blue Washed Potato Bag", 1),
        ("Woolworths Beef Eye Fillet Steak", 1),
        ("Hercules Click Zip Large Resealable Twinzip Sandwich Bags", 1),
        ("D'Orsogna Shortcut Bacon From the Deli", 0),  # OOS
    ],
}

# Count appearances and gather quantities (skip items with [sub], OOS (qty=0) or lowercase subs
from collections import defaultdict

item_orders = defaultdict(list)  # item -> list of (order_num, qty)

for order_id, items in orders.items():
    for name, qty in items:
        # Skip substitution labels and OOS (qty=0 on original, sub has bracket)
        if '[sub' in name or name == name.lower() and not name[0].isupper():
            continue
        if qty == 0:
            continue
        item_orders[name].append((order_id, qty))

# Build frequency table
freq = {name: len(order_list) for name, order_list in item_orders.items()}
sorted_items = sorted(freq.items(), key=lambda x: -x[1])

print("=== FREQUENCY COUNT ===\n")
for name, count in sorted_items:
    qtys = [q for _, q in item_orders[name]]
    avg_qty = sum(qtys) / len(qtys)
    print(f"{count:2d} orders | avg qty {avg_qty:.1f} | {name}")

