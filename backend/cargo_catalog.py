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

OVERRIDES = {
    "Bananas": {"temperature": 13},
    "Strawberries": {"profile": "berries", "temperature": 2, "shelf_life": 84},
    "Blueberries": {"profile": "berries", "temperature": 2, "shelf_life": 168},
    "Raspberries": {"profile": "berries", "temperature": 2, "shelf_life": 84},
}

PRODUCTS = [
    {"id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
     "name": name, "category": group, "profile": profile,
     "temperature": temperature, "shelf_life": shelf, **OVERRIDES.get(name, {})}
    for group, profile, temperature, shelf, names in GROUPS
    for name in names.split("|")
]
PRODUCT_BY_ID = {product["id"]: product for product in PRODUCTS}
