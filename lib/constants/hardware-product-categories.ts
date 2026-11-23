/**
 * Canonical product categories for a Tanzanian hardware dealership
 * (wholesale + retail). Used for POS chips, stock reports, and category cleanup.
 *
 * Existing org categories are matched by name / alias — we do not wipe custom names.
 */
export type HardwareProductCategoryDef = {
  /** Canonical display name stored on `categories.name`. */
  name: string;
  /** Alternate labels already used in the catalog that map to this category. */
  aliases?: string[];
  /**
   * Product-name keywords (English / Swahili / brand cues). Longer / more specific
   * phrases should come first within a category for better matching.
   */
  keywords: string[];
  /** Industry note — why this bucket matters for reporting. */
  reportHint?: string;
};

export const HARDWARE_PRODUCT_CATEGORIES: HardwareProductCategoryDef[] = [
  {
    name: "Cement & Aggregates",
    aliases: ["Cement", "Aggregates", "Building materials"],
    keywords: [
      "cement",
      "simba",
      "twiga",
      "tembo",
      "nyumba",
      "portland",
      "kokoto",
      "aggregat",
      "sand ",
      " mchanga",
      "grout",
      "skimcoat",
      "skim coat",
    ],
    reportHint: "Traffic driver / attach sales — keep separate from Misc",
  },
  {
    name: "Steel & Rebar",
    aliases: ["Steel", "Rebar", "Iron", "Metal"],
    keywords: [
      "nondo",
      "rebar",
      "round bar",
      "angle bar",
      "flat bar",
      "binding wire",
      "wire mesh",
      "mesh wire",
      "ms plate",
      "mild steel",
      "gi pipe",
      "hollow section",
      "square tube",
      "rectangular tube",
    ],
    reportHint: "Capital-heavy construction steel",
  },
  {
    name: "Roofing",
    aliases: ["Iron sheets", "Bati"],
    keywords: [
      "bati",
      "iron sheet",
      "roofing sheet",
      "corrugat",
      "ridge cap",
      "valley gutter",
      "ibox",
      "ibox ",
      "box profile",
      "IT5",
      "it5",
    ],
    reportHint: "High ticket; separate from general steel",
  },
  {
    name: "Plumbing",
    aliases: ["Pipes & Fittings", "PVC", "PPR"],
    keywords: [
      "ppr",
      "pvc",
      "ips ",
      "pex ",
      "hdpe",
      "elbow",
      " tee",
      "tee ",
      "socket",
      "nipple",
      "union ",
      "valve",
      "ball valve",
      "gate valve",
      "non return",
      "check valve",
      "tap ",
      "faucet",
      "bibcock",
      "gutter",
      "downpipe",
      "water tank",
      "tank float",
      "giloti",
      "pipe wrench",
      "thread tape",
      "ptfe",
    ],
    reportHint: "High-margin fittings — track vs capital share",
  },
  {
    name: "Electrical",
    aliases: ["Wiring", "Lighting"],
    keywords: [
      "cable",
      "flex wire",
      "twin ",
      "earth wire",
      "switch",
      "socket outlet",
      "wall socket",
      "mcb",
      "breaker",
      "db box",
      "distribution board",
      "conduit",
      "trunking",
      "bulb",
      "led ",
      "fluorescent",
      "extension cord",
      "plug top",
      "consumer unit",
    ],
  },
  {
    name: "Fasteners",
    aliases: ["Nails & Screws", "Nails", "Screws"],
    keywords: [
      "misumari",
      "nail ",
      "nails",
      "screw",
      "bolts",
      "bolt ",
      "nut ",
      "nuts",
      "washer",
      "rivet",
      "anchor bolt",
      "rawlplug",
      "dowel",
      "self tap",
      "coach screw",
    ],
  },
  {
    name: "Paint & Coatings",
    aliases: ["Paint", "COLORANT", "Colorant", "Coatings"],
    keywords: [
      "paint",
      "emulsion",
      "gloss",
      "primer",
      "undercoat",
      "varnish",
      "thinner",
      "turpentine",
      "colorant",
      "colourant",
      "pigment",
      "crown paint",
      "goldstar",
      "inala",
      "basco",
    ],
    reportHint: "Do not lump colorants into Misc",
  },
  {
    name: "Adhesives & Sealants",
    aliases: ["Adhesives", "Glue", "Sealants", "Gundi"],
    keywords: [
      "gundi",
      "glue",
      "adhesive",
      "sealant",
      "silicon",
      "silicone",
      "epoxy",
      "putty",
      "wood filler",
      "bond crete",
      "super glue",
    ],
  },
  {
    name: "Tools",
    aliases: ["Hand Tools", "Power Tools", "Hand tools"],
    keywords: [
      "hammer",
      "spanner",
      "wrench",
      "pliers",
      "screwdriver",
      "tape measure",
      "spirit level",
      "chisel",
      "trowel",
      "float ",
      "machete",
      "panga",
      "jembe",
      "shovel",
      "wheelbarrow",
      "drill machine",
      "angle grinder",
      "circular saw",
    ],
  },
  {
    name: "Abrasives & Bits",
    aliases: ["Abrasives", "Drill Bits", "Cutting discs"],
    keywords: [
      "sandpaper",
      "sand paper",
      "grinding disc",
      "cutting disc",
      "cut off disc",
      "flap disc",
      "drill bit",
      "masonry bit",
      "wood bit",
      "abrasive",
    ],
  },
  {
    name: "Boards & Timber",
    aliases: ["Timber", "Wood", "Plywood", "Boards"],
    keywords: [
      "plywood",
      "mdf",
      "chipboard",
      "osb",
      "timber",
      "hardwood",
      "softwood",
      "cypress",
      "pine ",
      "blockboard",
      "gypsum board",
      "cement board",
      "formwork",
    ],
  },
  {
    name: "Hardware & Fittings",
    aliases: ["Door hardware", "Locks & Hinges", "Fittings"],
    keywords: [
      "hinge",
      "padlock",
      "mortice",
      "mortise",
      "door lock",
      "cylinder lock",
      "handle",
      "knob",
      "door closer",
      "hasp",
      "bracket",
      "curtain rail",
    ],
  },
  {
    name: "Brushes & Cleaning",
    aliases: ["Cleaning", "Brushes"],
    keywords: [
      "paint brush",
      "brush",
      "roller",
      "broom",
      "mop ",
      "dustpan",
      "cleaner",
      "detergent",
      "soap ",
    ],
  },
  {
    name: "Safety & PPE",
    aliases: ["PPE", "Safety"],
    keywords: [
      "helmet",
      "safety boot",
      "gumboot",
      "glove",
      "goggle",
      "safety glass",
      "mask ",
      "overall",
      "reflector",
      "ppe",
    ],
  },
  {
    name: "Kitchen & Sanitary",
    aliases: ["Kitchen", "Sanitary", "Bathroom"],
    keywords: [
      "mixer tap",
      "kitchen sink",
      "basin",
      "wash basin",
      "toilet",
      "cistern",
      "shower",
      "bathtub",
      "urinal",
    ],
  },
];

export function normalizeCategoryKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Map any known label (canonical or alias) → canonical category name. */
export function canonicalCategoryName(raw: string): string | null {
  const key = normalizeCategoryKey(raw);
  if (!key) return null;
  for (const def of HARDWARE_PRODUCT_CATEGORIES) {
    if (normalizeCategoryKey(def.name) === key) return def.name;
    for (const alias of def.aliases ?? []) {
      if (normalizeCategoryKey(alias) === key) return def.name;
    }
  }
  return null;
}
