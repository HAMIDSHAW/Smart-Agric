"""
SmartAgri database seeder.
Safe to run multiple times - checks existing data first.
"""
import os, sys, random, uuid
from datetime import datetime, timedelta

os.environ.setdefault('FLASK_ENV', 'production')
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app, db
from app.models import (User, DiseaseAnalysis, CropRecommendation,
                         FertilizerPlan, LandAssessment, SoilAnalysis,
                         CropCalendar, HarvestTracker, PostHarvestAdvice)

app = create_app()

DISTRICTS = ['Bo','Bombali','Kenema','Kailahun','Moyamba','Port Loko',
             'Tonkolili','Western Area Urban','Western Area Rural',
             'Kono','Pujehun','Bonthe','Kambia','Karene','Koinadugu','Falaba']

FARMERS = [
    # (name, email, district, language)
    ('Mohamed Kamara',       'mkamara@farmer.sl',      'Bo',                 'en'),
    ('Aminata Koroma',       'akoroma@farmer.sl',       'Kenema',             'en'),
    ('Ibrahim Sesay',        'ises@farmer.sl',          'Bombali',            'kr'),
    ('Fatmata Bangura',      'fbangura@farmer.sl',      'Tonkolili',          'en'),
    ('Sorie Conteh',         'sconteh@farmer.sl',       'Kailahun',           'en'),
    ('Mariama Turay',        'mturay@farmer.sl',        'Moyamba',            'kr'),
    ('Alpha Jalloh',         'ajalloh@farmer.sl',       'Port Loko',          'en'),
    ('Hawa Mansaray',        'hmansaray@farmer.sl',     'Western Area Urban', 'en'),
    ('Alhaji Fofanah',       'afofanah@farmer.sl',      'Kono',               'en'),
    ('Isatu Dumbuya',        'idumbuya@farmer.sl',      'Western Area Rural', 'kr'),
    ('Brima Koroma',         'bkoroma@farmer.sl',       'Bo',                 'en'),
    ('Kadiatu Sesay',        'kdsesay@farmer.sl',       'Kenema',             'en'),
    ('Amara Turay',          'aturay@farmer.sl',        'Pujehun',            'kr'),
    ('Kumba Bangura',        'kbangura@farmer.sl',      'Port Loko',          'en'),
    ('Sheku Kamara',         'skamara@farmer.sl',       'Bombali',            'en'),
    ('Mariatu Conteh',       'mconteh@farmer.sl',       'Kailahun',           'kr'),
    ('Gibril Jalloh',        'gjalloh@farmer.sl',       'Kambia',             'en'),
    ('Fanta Sesay',          'fsesay@farmer.sl',        'Tonkolili',          'en'),
    ('Lansana Koroma',       'lkoroma@farmer.sl',       'Kono',               'en'),
    ('Adama Mansaray',       'amansaray@farmer.sl',     'Moyamba',            'kr'),
    ('Issa Dumbuya',         'isdumbuya@farmer.sl',     'Bonthe',             'en'),
    ('Haja Kamara',          'hkamara@farmer.sl',       'Bo',                 'en'),
    ('Samba Bangura',        'sbangura@farmer.sl',      'Karene',             'kr'),
    ('Tenneh Turay',         'tturay@farmer.sl',        'Koinadugu',          'en'),
    ('Foday Conteh',         'fconteh@farmer.sl',       'Western Area Urban', 'en'),
    ('Sia Sesay',            'ssesay@farmer.sl',        'Kenema',             'kr'),
    ('Momoh Fofanah',        'mfofanah@farmer.sl',      'Falaba',             'en'),
    ('Rugiatu Koroma',       'rkoroma@farmer.sl',       'Bombali',            'en'),
    ('Yankuba Jalloh',       'yjalloh@farmer.sl',       'Kailahun',           'en'),
    ('Jeneba Mansaray',      'jmansaray@farmer.sl',     'Port Loko',          'kr'),
]

DISEASE_RECORDS = [
    ('Cassava Brown Streak Virus Disease', 'Cassava',   False, 'high',   87.3, 'Kailahun'),
    ('Cassava Bacterial Blight',           'Cassava',   False, 'medium', 79.1, 'Bo'),
    ('Cassava Mosaic Disease',             'Cassava',   False, 'high',   91.5, 'Kenema'),
    ('Tomato Late Blight',                 'Tomato',    False, 'high',   91.2, 'Bombali'),
    ('Tomato Early Blight',                'Tomato',    False, 'medium', 83.5, 'Bo'),
    ('Rice Blast',                         'Rice',      False, 'high',   88.9, 'Tonkolili'),
    ('Rice Leaf Scald',                    'Rice',      False, 'low',    71.4, 'Port Loko'),
    ('Maize Northern Leaf Blight',         'Maize',     False, 'medium', 76.8, 'Moyamba'),
    ('Maize Common Rust',                  'Maize',     False, 'low',    68.2, 'Kenema'),
    ('Groundnut Leaf Spot',                'Groundnut', False, 'medium', 82.1, 'Kono'),
    ('Cocoa Black Pod Disease',            'Cocoa',     False, 'high',   85.4, 'Kailahun'),
    ('Cocoa Swollen Shoot Virus',          'Cocoa',     False, 'high',   78.9, 'Kenema'),
    ('Pepper Bacterial Spot',              'Pepper',    False, 'medium', 77.6, 'Western Area Urban'),
    ('Nitrogen Deficiency',                'Cassava',   False, 'medium', 73.2, 'Bo'),
    ('Potassium Deficiency',               'Maize',     False, 'low',    69.8, 'Bombali'),
    ('Healthy Plant',                      'Cassava',   True,  'none',   94.5, 'Western Area Rural'),
    ('Healthy Plant',                      'Rice',      True,  'none',   96.3, 'Moyamba'),
    ('Healthy Plant',                      'Tomato',    True,  'none',   91.7, 'Kenema'),
    ('Healthy Plant',                      'Maize',     True,  'none',   89.4, 'Port Loko'),
    ('Healthy Plant',                      'Cocoa',     True,  'none',   93.1, 'Kailahun'),
]

CROP_RECS = [
    [{'crop':'Rice','score':94,'notes':'Excellent match for swamp areas'},{'crop':'Cassava','score':87},{'crop':'Groundnut','score':79}],
    [{'crop':'Cassava','score':91,'notes':'Best for upland areas in Sierra Leone'},{'crop':'Maize','score':83},{'crop':'Sweet Potato','score':76}],
    [{'crop':'Tomato','score':88,'notes':'High market value in Freetown'},{'crop':'Pepper','score':81},{'crop':'Okra','score':74}],
    [{'crop':'Maize','score':85,'notes':'Fast growing, high demand'},{'crop':'Rice','score':78},{'crop':'Groundnut','score':72}],
    [{'crop':'Groundnut','score':90,'notes':'Ideal for sandy loam soils'},{'crop':'Cassava','score':82},{'crop':'Sweet Potato','score':75}],
    [{'crop':'Cocoa','score':87,'notes':'High value export crop, suits Kenema/Kailahun'},{'crop':'Cassava','score':80},{'crop':'Banana','score':73}],
    [{'crop':'Rice','score':93,'notes':'Priority crop under Feed Salone'},{'crop':'Maize','score':84},{'crop':'Cassava','score':78}],
]

FERTILIZER_RECS = [
    {'crop':'Rice',      'fertilizer':'NPK 20-10-10','qty_per_ha':'150 kg/ha','timing':'Apply at planting, then top-dress at 6 weeks','notes':'Split application reduces losses from heavy rain'},
    {'crop':'Cassava',   'fertilizer':'NPK 0-20-20', 'qty_per_ha':'120 kg/ha','timing':'Apply 2 weeks after planting','notes':'Cassava responds well to potassium'},
    {'crop':'Maize',     'fertilizer':'NPK 15-15-15','qty_per_ha':'180 kg/ha','timing':'Apply at planting and at tasseling stage','notes':'Second application at V6 stage improves grain fill'},
    {'crop':'Tomato',    'fertilizer':'NPK 10-20-10','qty_per_ha':'100 kg/ha','timing':'Apply at transplanting and fruiting','notes':'Calcium foliar spray prevents blossom end rot'},
    {'crop':'Groundnut', 'fertilizer':'SSP 0-20-0',  'qty_per_ha':'90 kg/ha', 'timing':'Apply at planting only','notes':'Groundnut fixes nitrogen, do not over-apply N'},
    {'crop':'Cocoa',     'fertilizer':'NPK 15-5-20', 'qty_per_ha':'200 kg/ha','timing':'Apply at start and end of rainy season','notes':'Mulch around base to retain moisture'},
]

SOIL_TYPES = [
    ('Laterite','72.4'),('Sandy Loam','81.2'),('Clay','68.9'),
    ('Loam','77.5'),('Sandy','65.1'),('Clay Loam','73.8'),
]

HARVEST_CROPS = [
    ('Cassava',270),('Rice',120),('Maize',90),
    ('Tomato',75),('Groundnut',110),('Sweet Potato',100),('Cocoa',365),
]

POST_HARVEST_DATA = [
    {'crop':'Cassava','quantity':500,'advice':{'storage_duration':'3-5 days fresh, 6 months dried','ideal_temperature':'10-15°C','moisture_control':'Keep dry, avoid direct sunlight','best_containers':['Woven sacks','Wooden crates'],'tips':['Peel and dry within 24 hours','Store in cool ventilated place','Check weekly for rot'],'market_timing':'Sell fresh within 3 days or process into gari','value_addition':'Process into gari or fufu flour for 3x value increase','common_mistakes':['Storing fresh cassava for more than 5 days','Exposing to rain after harvest']}},
    {'crop':'Rice','quantity':800,'advice':{'storage_duration':'12-18 months properly dried','ideal_temperature':'Below 25°C','moisture_control':'Dry to 14% moisture content before storage','best_containers':['Metal silos','Sealed plastic drums','PICS bags'],'tips':['Thresh within 24 hours','Sun-dry 3 days minimum','Store off ground on pallets'],'market_timing':'Hold until December-January for 20-30% price premium','value_addition':'Mill locally for white rice premium','common_mistakes':['Storing with moisture above 14%','Using damaged sacks']}},
    {'crop':'Cocoa','quantity':200,'advice':{'storage_duration':'6-12 months dried and fermented','ideal_temperature':'18-25°C','moisture_control':'Dry to 7.5% moisture, store in jute sacks','best_containers':['Jute sacks','Raised wooden pallets'],'tips':['Ferment 5-7 days before drying','Dry to clicking sound when beans hit','Store off ground away from strong odours'],'market_timing':'Export buying season November to March','value_addition':'Grade A beans command 20% premium at export','common_mistakes':['Under-fermentation reduces quality grade','Mixing with foreign matter']}},
]

CAL_WEEKS_RICE = [
    {'week':1,'phase':'Land Preparation','tasks':['Clear weeds and burn','Plough to 20cm depth','Check drainage channels'],'water_needs':'low','watch_for':'Adequate drainage before planting'},
    {'week':2,'phase':'Planting','tasks':['Broadcast seed at 80kg/ha','Apply basal NPK fertilizer'],'water_needs':'medium','watch_for':'Birds eating seed - use scarecrow'},
    {'week':4,'phase':'Early Growth','tasks':['First weeding','Check for pest damage'],'water_needs':'medium','watch_for':'Shoot fly and stem borer damage'},
    {'week':8,'phase':'Active Growth','tasks':['Apply nitrogen top-dressing','Second weeding'],'water_needs':'high','watch_for':'Rice blast on leaves - grey spots with dark borders'},
    {'week':14,'phase':'Flowering','tasks':['Maintain water level','Scout for brown planthopper'],'water_needs':'high','watch_for':'Neck blast at panicle emergence'},
    {'week':16,'phase':'Maturity','tasks':['Reduce water 2 weeks before harvest','Check grain moisture'],'water_needs':'low','watch_for':'80% golden grains = ready to harvest'},
    {'week':18,'phase':'Harvest','tasks':['Harvest when 80% golden','Thresh within 24 hours','Dry immediately'],'water_needs':'none','watch_for':'Grain quality and moisture content'},
]

def rand_date(days_back_max=120, days_back_min=1):
    d = random.randint(days_back_min, days_back_max)
    return datetime.utcnow() - timedelta(days=d)

def seed():
    with app.app_context():
        existing = User.query.filter(User.role == 'farmer').count()
        if existing >= 15:
            print(f'Already seeded ({existing} farmer accounts). Skipping.')
            return

        print('Seeding SmartAgri with realistic Sierra Leone data...')

        # No admin account is created here (use ADMIN_EMAIL / ADMIN_PASSWORD, see docs/ADMIN_SETUP.md).
        # Demo farmers get a password from the environment: no public default password.
        import os
        from app import bcrypt
        demo_pw = os.environ.get('SEED_USERS_PASSWORD', '')
        if len(demo_pw) < 12:
            print('Demo data NOT seeded: set SEED_USERS_PASSWORD (12+ characters) first.')
            return
        demo_hash = bcrypt.generate_password_hash(demo_pw).decode('utf-8')

        # Create farmers
        farmers = []
        for name, email, district, lang in FARMERS:
            user = User.query.filter_by(email=email).first()
            if not user:
                user = User(
                    full_name=name, email=email,
                    password_hash=demo_hash,
                    role='farmer', district=district,
                    preferred_language=lang, is_active=True,
                    created_at=rand_date(300, 30),
                    last_login=rand_date(7, 0)
                )
                db.session.add(user)
            farmers.append((user, district))
        db.session.flush()
        print(f'  Created {len(farmers)} farmer accounts')

        # Disease analyses - 5-12 per farmer
        dc = 0
        for user, district in farmers:
            for _ in range(random.randint(5, 12)):
                rec = random.choice(DISEASE_RECORDS)
                da = DiseaseAnalysis(
                    user_id=user.id, plant_type=rec[1],
                    image_path=f'uploads/disease/{uuid.uuid4().hex[:8]}.jpg',
                    is_healthy=rec[2], disease_name=rec[0],
                    confidence=round(rec[4] + random.uniform(-4, 4), 1),
                    field_location=f'{district} Field {random.randint(1,6)}',
                    raw_response={'disease_name': rec[0], 'severity': rec[3], 'district': rec[5]},
                    created_at=rand_date(90, 1)
                )
                db.session.add(da); dc += 1
        print(f'  Created {dc} disease analyses')

        # Crop recommendations - 3-6 per farmer
        rc = 0
        for user, district in farmers:
            for _ in range(random.randint(3, 6)):
                recs = random.choice(CROP_RECS)
                cr = CropRecommendation(
                    user_id=user.id,
                    nitrogen=round(random.uniform(20, 80), 1),
                    phosphorus=round(random.uniform(10, 50), 1),
                    potassium=round(random.uniform(15, 60), 1),
                    temperature=round(random.uniform(24, 32), 1),
                    humidity=round(random.uniform(60, 85), 1),
                    rainfall=round(random.uniform(1000, 2500)),
                    ph=round(random.uniform(5.5, 7.2), 1),
                    district=district, recommendations=recs,
                    created_at=rand_date(80, 1)
                )
                db.session.add(cr); rc += 1
        print(f'  Created {rc} crop recommendations')

        # Fertilizer plans - 2-4 per farmer
        fc = 0
        for user, district in farmers:
            for _ in range(random.randint(2, 4)):
                plan = random.choice(FERTILIZER_RECS)
                fp = FertilizerPlan(
                    user_id=user.id, crop=plan['crop'],
                    growth_stage=random.choice(['Pre-planting','Early growth','Flowering']),
                    nitrogen=round(random.uniform(20, 80), 1),
                    phosphorus=round(random.uniform(10, 50), 1),
                    potassium=round(random.uniform(15, 60), 1),
                    plan=plan, created_at=rand_date(70, 1)
                )
                db.session.add(fp); fc += 1
        print(f'  Created {fc} fertilizer plans')

        # Soil analyses - 2-4 per farmer
        sc = 0
        for user, district in farmers:
            for _ in range(random.randint(2, 4)):
                st, conf = random.choice(SOIL_TYPES)
                sa = SoilAnalysis(
                    user_id=user.id, input_method='image',
                    soil_type=st, confidence=float(conf) + random.uniform(-3, 3),
                    district=district, created_at=rand_date(60, 1)
                )
                db.session.add(sa); sc += 1
        print(f'  Created {sc} soil analyses')

        # Harvest trackers - 1-2 per farmer
        hc = 0
        for user, district in farmers[:20]:
            crop, days = random.choice(HARVEST_CROPS)
            planted_ago = random.randint(10, min(80, days - 5))
            planted = datetime.utcnow() - timedelta(days=planted_ago)
            ht = HarvestTracker(
                user_id=user.id, crop=crop,
                planted_date=planted.strftime('%Y-%m-%d'),
                days_to_harvest=days, district=district,
                notes=f'Planted in {district}.',
                created_at=planted
            )
            db.session.add(ht); hc += 1
        print(f'  Created {hc} harvest trackers')

        # Post-harvest records - 1-2 per farmer
        phc = 0
        for user, district in farmers[:18]:
            rec = random.choice(POST_HARVEST_DATA)
            pha = PostHarvestAdvice(
                user_id=user.id, crop=rec['crop'],
                quantity=rec['quantity'] + random.randint(-100, 200),
                district=district, advice=rec['advice'],
                created_at=rand_date(40, 1)
            )
            db.session.add(pha); phc += 1
        print(f'  Created {phc} post-harvest records')

        # Crop calendars - 1-2 per farmer
        cac = 0
        for user, district in farmers[:20]:
            cc = CropCalendar(
                user_id=user.id, crop='Rice',
                district=district, season='Rainy Season (May-Oct)',
                calendar=CAL_WEEKS_RICE,
                harvest_date='Week 16-18',
                created_at=rand_date(30, 1)
            )
            db.session.add(cc); cac += 1
        print(f'  Created {cac} crop calendars')

        db.session.commit()
        print('\nSeeding complete!')
        print('  Demo farmer accounts use the password in SEED_USERS_PASSWORD.')

if __name__ == '__main__':
    seed()
