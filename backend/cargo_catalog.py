"""Representative ocean-freight commodities, grouped for discovery (not a volume ranking).

Handling values are editable planning defaults, not carriage instructions. Product
identity is independent of the four legacy perishability models used by routing.
"""
import re

GROUPS = [
    ("Fresh produce", "avocados", 5, 336,
     "Avocados|Bananas|Apples|Oranges|Lemons|Limes|Grapefruit|Mandarins|Pears|Grapes|Mangoes|Pineapples|Papayas|Melons|Watermelons|Peaches|Nectarines|Plums|Cherries|Kiwifruit|Strawberries|Blueberries|Raspberries|Potatoes|Onions|Garlic|Carrots|Cabbage|Tomatoes|Sweet potatoes"),
    ("Grains, pulses & dry foods", "grain", 18, 6000,
     "Wheat|Corn|Rice|Barley|Oats|Sorghum|Rye|Millet|Quinoa|Soybeans|Lentils|Chickpeas|Dried peas|Dried beans|Peanuts|Almonds|Cashews|Walnuts|Pistachios|Sesame seeds|Sunflower seeds|Wheat flour|Pasta|Refined sugar|Raw sugar"),
    ("Chilled foods & flowers", "berries", 2, 168,
     "Chilled beef|Chilled pork|Chilled lamb|Chilled poultry|Fresh salmon|Fresh tuna|Fresh cod|Fresh shellfish|Fresh shrimp|Milk|Cream|Butter|Cheese|Yogurt|Eggs|Tofu|Fresh mushrooms|Fresh asparagus|Cut flowers|Fresh herbs"),
    ("Frozen foods", "grain", -18, 4320,
     "Frozen beef|Frozen pork|Frozen lamb|Frozen chicken|Frozen turkey|Frozen salmon|Frozen tuna|Frozen whitefish|Frozen shrimp|Frozen squid|Frozen octopus|Frozen shellfish|Frozen vegetables|Frozen peas|Frozen sweetcorn|Frozen berries|Frozen mango|Frozen fruit puree|Ice cream|Frozen prepared meals"),
    ("Beverages & food ingredients", "grain", 18, 6000,
     "Coffee beans|Roasted coffee|Cocoa beans|Cocoa powder|Chocolate|Tea|Spices|Black pepper|Vanilla|Olive oil|Sunflower oil|Palm oil|Canola oil|Coconut oil|Soybean oil|Wine|Beer|Spirits|Fruit juice concentrate|Bottled water"),
    ("Ores, minerals & bulk materials", "electronics", 18, 99999,
     "Iron ore|Bauxite|Copper ore|Nickel ore|Manganese ore|Zinc ore|Lead ore|Chromite ore|Lithium ore|Phosphate rock|Thermal coal|Metallurgical coal|Petroleum coke|Cement clinker|Cement|Limestone|Gypsum|Silica sand|Industrial salt|Soda ash|Sulfur|Potash|Urea fertilizer|Ammonium sulfate|Compound fertilizer"),
    ("Timber, pulp & paper", "electronics", 18, 99999,
     "Hardwood logs|Softwood logs|Sawn hardwood|Sawn softwood|Plywood|Medium-density fiberboard|Particle board|Oriented strand board|Wood pellets|Wood chips|Wood pulp|Recovered paper|Newsprint|Printing paper|Kraft paper|Tissue paper|Paperboard|Corrugated cardboard|Paper packaging|Cork"),
    ("Metals & metal products", "electronics", 18, 99999,
     "Steel coils|Steel plates|Steel billets|Steel slabs|Steel rebar|Steel pipes|Steel wire rod|Structural steel|Stainless steel|Scrap steel|Aluminum ingots|Aluminum sheets|Aluminum foil|Aluminum scrap|Copper cathodes|Copper wire|Copper scrap|Zinc ingots|Lead ingots|Nickel metal|Tin ingots|Ferroalloys|Cast iron products|Metal fasteners|Metal containers"),
    ("Energy, chemicals & raw materials", "electronics", 18, 99999,
     "Crude oil|Diesel fuel|Gasoline|Jet fuel|Fuel oil|Liquefied natural gas|Liquefied petroleum gas|Methanol|Ethanol|Ethylene glycol|Acetic acid|Caustic soda|Sulfuric acid|Phosphoric acid|Industrial solvents|Lubricating oil|Bitumen|Polyethylene resin|Polypropylene resin|PVC resin|PET resin|Polystyrene resin|Synthetic rubber|Natural rubber|Industrial adhesives"),
    ("Machinery, electronics & vehicles", "electronics", 18, 99999,
     "Passenger cars|Commercial trucks|Buses|Motorcycles|Bicycles|Tractors|Excavators|Bulldozers|Forklifts|Agricultural machinery|Industrial machinery|Machine tools|Electric motors|Generators|Transformers|Pumps|Valves|Solar panels|Wind turbine components|Computers|Computer components|Mobile phones|Televisions|Home appliances|Automotive parts"),
    ("Textiles & manufactured goods", "electronics", 18, 99999,
     "Raw cotton|Cotton yarn|Synthetic fibers|Wool|Textile fabric|Apparel|Footwear|Furniture|Mattresses|Carpets|Toys|Sporting goods|Ceramic tiles|Sanitary ware|Glass sheets|Glass bottles|Vehicle tires|Household plastics|Medical equipment|Books"),
]

# (quality horizon in days, reference temperature in Celsius). These are
# commodity-specific planning estimates, not handling or food-safety limits.
ITEM_PARAMETERS = {
    "Avocados": (21,5), "Bananas": (21,13), "Apples": (60,0),
    "Oranges": (60,5), "Lemons": (90,12), "Limes": (42,10),
    "Grapefruit": (60,10), "Mandarins": (28,5), "Pears": (60,0),
    "Grapes": (28,0), "Mangoes": (14,13), "Pineapples": (21,10),
    "Papayas": (14,10), "Melons": (14,7), "Watermelons": (14,10),
    "Peaches": (14,0), "Nectarines": (14,0), "Plums": (28,0),
    "Cherries": (14,0), "Kiwifruit": (90,0), "Strawberries": (7,0),
    "Blueberries": (14,0), "Raspberries": (3,0), "Potatoes": (120,7),
    "Onions": (120,0), "Garlic": (180,0), "Carrots": (90,0),
    "Cabbage": (60,0), "Tomatoes": (14,12), "Sweet potatoes": (120,13),
    "Wheat": (365,18), "Corn": (180,18), "Rice": (365,18),
    "Barley": (365,18), "Oats": (180,18), "Sorghum": (365,18),
    "Rye": (365,18), "Millet": (180,18), "Quinoa": (365,18),
    "Soybeans": (180,18), "Lentils": (365,18), "Chickpeas": (365,18),
    "Dried peas": (365,18), "Dried beans": (365,18), "Peanuts": (180,18),
    "Almonds": (180,18), "Cashews": (180,18), "Walnuts": (180,18),
    "Pistachios": (180,18), "Sesame seeds": (180,18), "Sunflower seeds": (120,18),
    "Wheat flour": (180,18), "Pasta": (540,18), "Refined sugar": (730,18), "Raw sugar": (730,18),
    "Chilled beef": (5,0), "Chilled pork": (4,0), "Chilled lamb": (5,0),
    "Chilled poultry": (2,0), "Fresh salmon": (2,0), "Fresh tuna": (2,0),
    "Fresh cod": (2,0), "Fresh shellfish": (2,0), "Fresh shrimp": (2,0),
    "Milk": (7,2), "Cream": (7,2), "Butter": (90,2), "Cheese": (60,2),
    "Yogurt": (14,2), "Eggs": (28,4), "Tofu": (7,2),
    "Fresh mushrooms": (7,0), "Fresh asparagus": (10,0), "Cut flowers": (7,2), "Fresh herbs": (7,2),
    "Frozen beef": (180,-18), "Frozen pork": (180,-18), "Frozen lamb": (180,-18),
    "Frozen chicken": (270,-18), "Frozen turkey": (270,-18), "Frozen salmon": (90,-18),
    "Frozen tuna": (90,-18), "Frozen whitefish": (180,-18), "Frozen shrimp": (180,-18),
    "Frozen squid": (180,-18), "Frozen octopus": (180,-18), "Frozen shellfish": (90,-18),
    "Frozen vegetables": (270,-18), "Frozen peas": (270,-18), "Frozen sweetcorn": (270,-18),
    "Frozen berries": (180,-18), "Frozen mango": (180,-18), "Frozen fruit puree": (180,-18),
    "Ice cream": (60,-18), "Frozen prepared meals": (90,-18),
    "Coffee beans": (365,18), "Roasted coffee": (90,18), "Cocoa beans": (365,18),
    "Cocoa powder": (730,18), "Chocolate": (180,16), "Tea": (365,18),
    "Spices": (730,18), "Black pepper": (730,18), "Vanilla": (365,18),
    "Olive oil": (365,18), "Sunflower oil": (365,18), "Palm oil": (365,18),
    "Canola oil": (365,18), "Coconut oil": (365,18), "Soybean oil": (365,18),
    "Wine": (730,15), "Beer": (180,10), "Spirits": (1460,18),
    "Fruit juice concentrate": (180,0), "Bottled water": (730,18),
}

from .cargo_model import product_model

def make_product(name, group, profile, temperature, shelf):
    perishable = profile != "electronics"
    if perishable:
        days, temperature = ITEM_PARAMETERS[name]
        shelf = days*24
    if name in {"Strawberries","Blueberries","Raspberries"}: profile = "berries"
    if group == "Frozen foods": profile = "frozen"
    model = product_model(perishable,shelf,temperature,group == "Frozen foods")
    if name == "Ice cream": model["thaw_temperature"] = -5; model["thawed_quality_hours"] = 4
    return {"id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
            "name": name,"category": group,"profile": profile,
            "temperature": temperature,"shelf_life": shelf,"model": model}

PRODUCTS = [make_product(name,group,profile,temperature,shelf)
    for group,profile,temperature,shelf,names in GROUPS for name in names.split("|")]
PRODUCT_BY_ID = {product["id"]: product for product in PRODUCTS}
