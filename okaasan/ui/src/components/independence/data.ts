import { ArticleDef, BlockDef } from '../article/base';

/**
 * Reference content for off-grid / homesteading planning.
 * Source notes: projects/independence/docs/house/*.rst
 */

interface BlockSpec {
    kind: string;
    data: any;
    children?: BlockSpec[];
}

const heading = (level: number, text: string): BlockSpec => ({ kind: 'heading', data: { level, text } });
const paragraph = (text: string, children?: BlockSpec[]): BlockSpec => ({ kind: 'paragraph', data: { text }, children });
const list = (items: string[], children?: BlockSpec[]): BlockSpec => ({ kind: 'list', data: { items, ordered: false }, children });
const link = (text: string, url: string): BlockSpec => ({ kind: 'link', data: { text, url } });
const links = (entries: Array<[string, string]>): BlockSpec => list([], entries.map(([text, url]) => link(text, url)));
const note = (message: string): BlockSpec => ({ kind: 'alert', data: { type: 'info', title: 'To research', message } });
const table = (caption: string, rows: Record<string, string>[]): BlockSpec => ({
    kind: 'table',
    data: { caption, showHeaders: true, data: JSON.stringify(rows) },
});

function buildArticle(id: number, title: string, namespace: string, specs: BlockSpec[]): ArticleDef {
    let sequence = 0;
    const toBlocks = (list: BlockSpec[]): BlockDef[] =>
        list.map((spec) => {
            const currentSequence = sequence++;
            return {
                id: currentSequence + 1,
                page_id: id,
                kind: spec.kind,
                data: spec.data,
                extension: {},
                sequence: currentSequence,
                children: spec.children ? toBlocks(spec.children) : [],
            };
        });

    return {
        id,
        root_id: id,
        title,
        namespace,
        sequence: 0,
        tags: {},
        extension: {},
        blocks: toBlocks(specs),
    };
}

const water = buildArticle(1, 'Water', 'independence/water', [
    heading(1, 'Water'),
    paragraph('Sources of water when off the municipal grid:'),
    list([
        'Private well dug deep into the ground',
        'Rainwater (collected in cisterns)',
        'Lakes and ponds',
        'Rivers',
        'Springs',
        'Purchased and stored water',
    ]),
    links([
        ['Puits Beaumont — artesian well drilling services (QC)', 'https://www.puitsbeaumont.ca/nos-services/puits-artesien'],
    ]),
    heading(2, 'Water Waste'),
    heading(3, 'Grey Water'),
    note('Greywater recycling/filtering options — not yet researched.'),
    heading(3, 'Black Water'),
    links([
        ['Septic Tank — Wikipedia', 'https://en.wikipedia.org/wiki/Septic_tank'],
        ['Imhoff Tank — Wikipedia', 'https://en.wikipedia.org/wiki/Imhoff_tank'],
    ]),
    paragraph('An Imhoff tank additionally handles:'),
    list(['Biogas capture', 'Sludge removal']),
]);

const energy = buildArticle(2, 'Energy & Electricity', 'independence/energy', [
    heading(1, 'Energy & Electricity'),
    paragraph('Using wood for heat/power is not as green as it seems — it releases CO2 and small particles harmful to health.'),
    heading(2, 'Typical Appliance Consumption'),
    table('Typical household appliance loads', [
        { Appliance: 'Fridge', Amp: '15A', Volt: '115V', Hz: '60Hz', 'kWh/y': '600' },
        { Appliance: 'Baseboard heater', Amp: '', Volt: '240V', Hz: '', 'kWh/y': '1500' },
        { Appliance: 'Heat Pump', Amp: '20A', Volt: '250V', Hz: '', 'kWh/y': '4700' },
        { Appliance: 'Stove', Amp: '', Volt: '', Hz: '', 'kWh/y': '7000' },
        { Appliance: 'Washer', Amp: '10A', Volt: '120V', Hz: '', 'kWh/y': '' },
        { Appliance: 'Water Heater', Amp: '', Volt: '', Hz: '', 'kWh/y': '3000' },
    ]),
    paragraph('Rough total: about 830 kWh of electricity per month.'),
    heading(2, 'Setup'),
    paragraph('Very few generation methods can cover peak consumption at all times, so every setup needs battery storage to smooth out supply.'),
    list([
        'Electricity generator',
        'Regulator',
        'Batteries',
        'DC-AC inverter',
        'Gas generator for backup/emergency',
    ]),
    links([
        ['DC-AC Inverters (Newark)', 'https://canada.newark.com/c/power-line-protection/dc-ac-inverters'],
        ['Charge Controller — EPEVER (example)', 'https://www.amazon.com/EPEVER-Controller-Regulator-Temperature-Monitoring/dp/B08CN1QZXF/ref=sr_1_7?tag=offgridpermac-20&th=1'],
        ['Lithium Battery (example)', 'https://www.amazon.ca/-/fr/Batterie-lithium-int%C3%A9gr%C3%A9e-cycles-charge/dp/B09BVNLRZK/ref=sr_1_3?__mk_fr_CA=%C3%85M%C3%85%C5%BD%C3%95%C3%91&crid=5SQCQWCN7D0D&keywords=Wind%2Bsolar%2Bbatteries&qid=1641754690&s=lawn-garden&sprefix=wind%2Bsolar%2Bbatteries%2Clawngarden%2C70&sr=1-3&th=1'],
    ]),
    heading(2, 'Energy Sources'),
    heading(3, 'Solar Panels'),
    list([
        'Photovoltaic — converts sunlight directly to electricity',
        'Needs storage for off hours',
        'Few moving parts (low maintenance)',
        'Requires an inverter and batteries',
        'Install panels on the south-facing side of the house',
    ]),
    heading(3, 'Hydro Electricity'),
    list([
        'Very consistent output',
        'Needs fewer batteries than solar/wind',
        'Requires a source of running water',
    ]),
    links([
        ['APM Hydro', 'https://apmhydro.com/products/'],
        ['Harris Micro Hydro', 'https://harrismicrohydro.com/'],
        ['Hi-Power Hydro', 'http://www.hipowerhydro.com/products.html'],
        ['Example micro-hydro unit (Amazon)', 'https://www.amazon.ca/dp/B01N6B3OKQ?linkCode=gs2&tag=smb0f-20'],
    ]),
    heading(3, 'Wind Power'),
    list([
        '5–15 kW needed: rotor ~23 ft diameter, on a tower 100+ ft tall',
        'Needs storage for off hours',
        'More moving parts — more maintenance',
    ]),
    links([
        ['Enbreeze 15kW turbine', 'http://enbreeze.com/en/enbreeze15kw/#data'],
    ]),
    heading(2, 'Electrical Refresher'),
    list([
        'Batteries in series increase voltage (2×12V → 24V); charge at the combined voltage and ideally charge each battery individually to avoid uneven charging.',
        'Batteries in parallel increase current/capacity while keeping voltage the same (2×200Ah → 400Ah), letting equipment run longer but taking longer to recharge.',
        'Watt = Volt × Amp',
    ]),
]);

const heatingArticle = buildArticle(3, 'Heating', 'independence/heating', [
    heading(1, 'Heating'),
    paragraph('Main options for heating the home:'),
    list(['Electricity', 'Gas', 'Wood']),
    note('Minimal notes so far — expand with cost/efficiency/backup comparisons.'),
]);

const construction = buildArticle(4, 'Construction & Insulation', 'independence/construction', [
    heading(1, 'Construction & Insulation'),
    paragraph('Reference links for milling your own lumber and natural insulation options:'),
    heading(2, 'Sawmilling'),
    links([
        ['Woodland Mills — portable sawmills', 'https://woodlandmills.ca/portable-sawmills/'],
        ['Best chainsaw mills (The Spruce)', 'https://www.thespruce.com/best-chainsaw-mills-4172474'],
    ]),
    heading(2, 'Natural Insulation'),
    links([
        ['Hemp insulation guide (Écohabitation)', 'https://www.ecohabitation.com/guides/2624/isolant-naturel-le-chanvre/'],
        ['Hemp insulation panels — comparison (Écohabitation)', 'https://www.ecohabitation.com/guides/3340/panneau-disolation-en-chanvre-gagnant-sur-toute-la-ligne/'],
        ['Natural fiber insulation panel (Canac)', 'https://www.canac.ca/fr/panneau-isolant-de-fibres-naturelles-7-16-po-x-4-pi-x-8-pi-716f'],
        ['Codebord insulation panel (Canac)', 'https://www.canac.ca/fr/panneau-isolant-codebord1-1-2-po-x-4-pi-x-8-pi-cb12'],
    ]),
]);

const waste = buildArticle(5, 'Waste', 'independence/waste', [
    heading(1, 'Waste'),
    paragraph('Primary strategy: composting.'),
    list(['Compost pile']),
]);

const food = buildArticle(6, 'Food', 'independence/food', [
    heading(1, 'Food'),
    heading(2, 'Garden'),
    note('Not yet researched — plan crop selection, layout, and rotation.'),
    heading(2, 'Green House'),
    links([
        ['Canada Greenhouse Kits', 'https://www.canada-greenhouse-kits.ca/'],
    ]),
    heading(2, 'Livestock'),
    list([
        'Cattle — meat, milk, leather',
        'Horse — locomotion, meat, leather',
        'Pig — meat, leather',
        'Sheep — milk, wool, meat, leather',
        'Goat — milk, meat, leather',
        'Rabbit — meat, fur',
        'Honey bee — honey, royal jelly',
        'Fish — meat',
        'Chicken — meat',
        'Duck — meat',
    ]),
    heading(2, 'Hydroponic'),
    list(['Compact garden setup']),
    links([
        ['Hydroponics — Wikipedia', 'https://en.wikipedia.org/wiki/Hydroponics'],
        ['Growroom — Wikipedia', 'https://en.wikipedia.org/wiki/Growroom'],
        ['Waterfarmers — aquaponics', 'https://waterfarmers.ca/aquaponics/'],
    ]),
    heading(2, 'Aquaponic'),
    list(['Combines fish farming with a garden']),
    links([
        ['Aquaponics — Wikipedia', 'https://en.wikipedia.org/wiki/Aquaponics'],
        ['Aquaponics for off-grid living', 'https://offgridliving.net/aquaponics-how-this-is-useful-for-off-the-grid-living/'],
    ]),
]);

export const independenceArticles = {
    water,
    energy,
    heating: heatingArticle,
    construction,
    waste,
    food,
} as const;

export type IndependenceTopic = keyof typeof independenceArticles;
