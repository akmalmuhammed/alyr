/**
 * Platform-neutral asset taxonomy.
 *
 * The stable IDs in this file are persisted product data. Labels, icons, and
 * presentation can change without migrating an asset. React components and
 * formatted UI values deliberately do not belong here so web, iOS, Android,
 * importers, and future APIs can share the same contract.
 */

export const ASSET_TAXONOMY_VERSION = 1;

function deepFreeze(value) {
  if (
    value &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function uniqueText(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const output = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    const key = normalizeSearchText(trimmed);
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    output.push(trimmed);
  }

  return output;
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function profileField(
  id,
  label,
  type = "text",
  {
    required = false,
    placeholder = "",
    helpText = "",
    privacy = "standard",
    options = [],
  } = {},
) {
  return {
    id,
    label,
    type,
    required,
    placeholder,
    helpText,
    privacy,
    options,
  };
}

/**
 * Category profiles describe optional, category-specific identity fields.
 * Name, category, ownership, location, value, notes, and materials remain
 * universal asset fields and are intentionally not repeated in these profiles.
 */
export const CATEGORY_PROFILES = deepFreeze([
  {
    id: "general-physical",
    label: "Physical item",
    fields: [
      profileField("maker", "Maker or brand", "text", {
        placeholder: "Maker, studio, or brand",
      }),
      profileField("model", "Model", "text", {
        placeholder: "Model or product name",
      }),
      profileField("serial-number", "Serial number", "text", {
        placeholder: "Serial, chassis, or identifying number",
        privacy: "sensitive",
      }),
      profileField("condition", "Condition", "select", {
        options: [
          "new",
          "excellent",
          "good",
          "fair",
          "needs-attention",
          "unknown",
        ],
      }),
    ],
  },
  {
    id: "vehicle",
    label: "Vehicle",
    fields: [
      profileField("make", "Make", "text", {
        required: true,
        placeholder: "e.g. Toyota",
      }),
      profileField("model", "Model", "text", {
        required: true,
        placeholder: "e.g. Land Cruiser",
      }),
      profileField("year", "Model year", "year"),
      profileField("vin", "VIN or chassis number", "text", {
        privacy: "sensitive",
        helpText: "Store the identifier, never a vehicle account password.",
      }),
      profileField("registration-number", "Registration number", "text", {
        privacy: "sensitive",
      }),
      profileField("registration-expiry", "Registration expiry", "date"),
      profileField("odometer", "Odometer", "number"),
    ],
  },
  {
    id: "real-estate",
    label: "Real estate or land",
    fields: [
      profileField("property-address", "Property address", "text", {
        required: true,
        placeholder: "Address or location description",
        privacy: "sensitive",
      }),
      profileField("title-deed-number", "Title deed number", "text", {
        privacy: "sensitive",
      }),
      profileField("parcel-number", "Parcel or plot number", "text", {
        privacy: "sensitive",
      }),
      profileField("ownership-share", "Ownership share", "percentage"),
    ],
  },
  {
    id: "watch",
    label: "Watch",
    fields: [
      profileField("brand", "Brand", "text", {
        required: true,
        placeholder: "e.g. Rolex",
      }),
      profileField("model", "Model", "text"),
      profileField("reference-number", "Reference number", "text"),
      profileField("serial-number", "Serial number", "text", {
        privacy: "sensitive",
      }),
      profileField("case-material", "Case material", "text"),
    ],
  },
  {
    id: "jewelry",
    label: "Jewelry",
    fields: [
      profileField("maker", "Maker or brand", "text"),
      profileField("material", "Primary material", "text"),
      profileField("hallmark", "Hallmark or serial", "text", {
        privacy: "sensitive",
      }),
      profileField("weight", "Weight", "text", {
        placeholder: "Include the unit",
      }),
      profileField("gemstone", "Gemstone details", "multiline"),
    ],
  },
  {
    id: "art-collectible",
    label: "Art or collectible",
    fields: [
      profileField("creator", "Artist, maker, or manufacturer", "text"),
      profileField("title-model", "Title or model", "text"),
      profileField("production-year", "Year", "year"),
      profileField("edition", "Edition or release", "text"),
      profileField("provenance-summary", "Provenance summary", "multiline", {
        helpText: "A concise history; supporting records belong in Materials.",
      }),
    ],
  },
  {
    id: "electronics",
    label: "Electronics",
    fields: [
      profileField("brand", "Brand", "text"),
      profileField("model", "Model", "text"),
      profileField("serial-number", "Serial number", "text", {
        privacy: "sensitive",
      }),
      profileField("device-identifier", "Device identifier", "text", {
        privacy: "sensitive",
        helpText: "Use an IMEI or hardware identifier, never a password.",
      }),
      profileField("warranty-expiry", "Warranty expiry", "date"),
    ],
  },
  {
    id: "digital-asset",
    label: "Digital asset or account",
    fields: [
      profileField("provider-platform", "Provider or platform", "text", {
        required: true,
      }),
      profileField("account-identifier", "Account reference", "text", {
        privacy: "sensitive",
        helpText: "Use a username or masked reference. Never store passwords or recovery phrases.",
      }),
      profileField("renewal-date", "Renewal date", "date"),
      profileField("recovery-status", "Recovery plan", "select", {
        options: ["documented", "trusted-contact", "not-documented", "not-applicable"],
      }),
    ],
  },
  {
    id: "financial-reference",
    label: "Financial reference",
    fields: [
      profileField("institution", "Institution", "text", {
        required: true,
      }),
      profileField("account-reference", "Masked account reference", "text", {
        privacy: "sensitive",
        helpText: "Use only a masked reference or last four digits. Never store credentials.",
      }),
      profileField("ownership-share", "Ownership share", "percentage"),
      profileField("opened-on", "Opened on", "date"),
    ],
  },
  {
    id: "business-entity",
    label: "Business or professional interest",
    fields: [
      profileField("entity-name", "Entity name", "text", {
        required: true,
      }),
      profileField("jurisdiction", "Jurisdiction", "text"),
      profileField("registration-number", "Registration number", "text", {
        privacy: "sensitive",
      }),
      profileField("ownership-share", "Ownership share", "percentage"),
    ],
  },
  {
    id: "document-record",
    label: "Document or record",
    fields: [
      profileField("issuer", "Issuer", "text"),
      profileField("document-number", "Document number", "text", {
        privacy: "sensitive",
      }),
      profileField("issue-date", "Issue date", "date"),
      profileField("expiry-date", "Expiry date", "date"),
    ],
  },
  {
    id: "memory-legacy",
    label: "Memory or legacy item",
    fields: [
      profileField("origin", "Origin", "text", {
        placeholder: "Who it came from or where it began",
      }),
      profileField("date-period", "Date or period", "text"),
      profileField("people", "People connected", "text"),
      profileField("story", "Story", "multiline", {
        helpText: "Supporting photos, letters, and recordings belong in Materials.",
      }),
    ],
  },
  {
    id: "intellectual-property",
    label: "Intellectual property",
    fields: [
      profileField("creator-owner", "Creator or rights holder", "text"),
      profileField("registration-number", "Registration number", "text", {
        privacy: "sensitive",
      }),
      profileField("jurisdiction", "Jurisdiction", "text"),
      profileField("renewal-date", "Renewal date", "date"),
    ],
  },
]);

function category(
  id,
  label,
  {
    aliases = [],
    description = "",
    profileId = "general-physical",
    kind = "physical",
    iconKey = "asset",
    recommendedEvidenceTypes = ["Current photo"],
  } = {},
) {
  return {
    id,
    label,
    aliases,
    description,
    profileId,
    kind,
    iconKey,
    recommendedEvidenceTypes,
  };
}

/**
 * Groups are intentionally broad and leaf categories are intentionally
 * concrete. An asset stores the leaf ID; the group is derived, which lets us
 * rename or reorganize navigation without corrupting ownership records.
 */
export const ASSET_CATEGORY_GROUPS = deepFreeze([
  {
    id: "vehicles-mobility",
    label: "Vehicles & mobility",
    description: "Vehicles, craft, mobility equipment, and their major parts.",
    iconKey: "vehicle",
    categories: [
      category("vehicle.car", "Car", {
        aliases: ["cars", "automobile", "auto", "sedan", "suv", "4x4"],
        description: "Personal cars, SUVs, and road vehicles.",
        profileId: "vehicle",
        iconKey: "car",
        recommendedEvidenceTypes: [
          "Current photo",
          "Registration",
          "Insurance policy",
          "Service record",
        ],
      }),
      category("vehicle.motorcycle", "Motorcycle", {
        aliases: ["motorbike", "motor bike", "bike", "scooter", "moped"],
        description: "Motorcycles, scooters, and mopeds.",
        profileId: "vehicle",
        iconKey: "motorcycle",
        recommendedEvidenceTypes: [
          "Current photo",
          "Registration",
          "Insurance policy",
          "Service record",
        ],
      }),
      category("vehicle.bicycle", "Bicycle", {
        aliases: ["cycle", "road bike", "mountain bike", "e-bike", "ebike"],
        description: "Bicycles, e-bikes, and specialist cycles.",
        profileId: "vehicle",
        iconKey: "bicycle",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt"],
      }),
      category("vehicle.boat", "Boat or watercraft", {
        aliases: ["boat", "yacht", "jet ski", "jetski", "watercraft", "vessel"],
        description: "Boats, yachts, personal watercraft, and vessels.",
        profileId: "vehicle",
        iconKey: "boat",
        recommendedEvidenceTypes: [
          "Current photo",
          "Registration",
          "Insurance policy",
          "Service record",
        ],
      }),
      category("vehicle.aircraft", "Aircraft", {
        aliases: ["plane", "airplane", "helicopter", "drone", "aviation"],
        description: "Owned aircraft and registered professional drones.",
        profileId: "vehicle",
        iconKey: "aircraft",
        recommendedEvidenceTypes: [
          "Current photo",
          "Registration",
          "Insurance policy",
          "Service record",
        ],
      }),
      category("vehicle.commercial", "Commercial or fleet vehicle", {
        aliases: ["truck", "van", "lorry", "bus", "fleet", "commercial vehicle"],
        description: "Trucks, vans, fleet vehicles, and specialist road equipment.",
        profileId: "vehicle",
        iconKey: "truck",
        recommendedEvidenceTypes: [
          "Current photo",
          "Registration",
          "Insurance policy",
          "Service record",
        ],
      }),
      category("vehicle.mobility-aid", "Mobility aid", {
        aliases: ["wheelchair", "mobility scooter", "adaptive vehicle"],
        description: "Personal mobility and adaptive equipment.",
        iconKey: "accessibility",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt", "Service record"],
      }),
      category("vehicle.parts-accessories", "Vehicle parts & accessories", {
        aliases: ["car parts", "motorcycle parts", "spare parts", "accessories"],
        description: "Material vehicle components worth tracking independently.",
        iconKey: "engine",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt"],
      }),
    ],
  },
  {
    id: "real-estate-land",
    label: "Real estate & land",
    description: "Owned homes, units, plots, commercial spaces, and land.",
    iconKey: "property",
    categories: [
      category("property.house", "House", {
        aliases: ["home", "villa", "townhouse", "residence"],
        description: "A standalone home, villa, or townhouse.",
        profileId: "real-estate",
        kind: "real-estate",
        iconKey: "house",
        recommendedEvidenceTypes: ["Title deed", "Insurance policy", "Current photo"],
      }),
      category("property.apartment", "Apartment or unit", {
        aliases: ["apartment", "flat", "condo", "condominium", "unit"],
        description: "An apartment, condominium, or owned unit.",
        profileId: "real-estate",
        kind: "real-estate",
        iconKey: "apartment",
        recommendedEvidenceTypes: ["Title deed", "Insurance policy", "Current photo"],
      }),
      category("property.land", "Plot or land", {
        aliases: ["plot", "land", "lot", "parcel", "vacant land"],
        description: "A plot, parcel, or undeveloped land holding.",
        profileId: "real-estate",
        kind: "real-estate",
        iconKey: "land",
        recommendedEvidenceTypes: ["Title deed", "Survey or site plan", "Current photo"],
      }),
      category("property.commercial", "Commercial property", {
        aliases: ["office", "shop", "retail", "warehouse", "commercial building"],
        description: "Commercial, retail, office, warehouse, or industrial property.",
        profileId: "real-estate",
        kind: "real-estate",
        iconKey: "buildings",
        recommendedEvidenceTypes: ["Title deed", "Insurance policy", "Lease record"],
      }),
      category("property.farm", "Farm or agricultural land", {
        aliases: ["farm", "ranch", "agricultural land", "estate"],
        description: "Agricultural land and working rural property.",
        profileId: "real-estate",
        kind: "real-estate",
        iconKey: "farm",
        recommendedEvidenceTypes: ["Title deed", "Survey or site plan", "Current photo"],
      }),
      category("property.rental-managed", "Rental or managed property", {
        aliases: ["rental property", "investment property", "managed property", "leased property"],
        description: "A property held for rent or managed by another party.",
        profileId: "real-estate",
        kind: "real-estate",
        iconKey: "key",
        recommendedEvidenceTypes: ["Title deed", "Insurance policy", "Lease record"],
      }),
      category("property.other", "Other or unspecified property", {
        aliases: ["property", "real estate", "building", "premises"],
        description: "A legacy or unusual property record that needs more classification.",
        profileId: "real-estate",
        kind: "real-estate",
        iconKey: "property",
        recommendedEvidenceTypes: ["Title deed", "Current photo"],
      }),
    ],
  },
  {
    id: "lifestyle-personal",
    label: "Lifestyle & collectibles",
    description: "Personal valuables, collections, creative objects, and hobbies.",
    iconKey: "lifestyle",
    categories: [
      category("lifestyle.watch", "Watch", {
        aliases: ["watches", "timepiece", "wristwatch", "clock"],
        description: "Watches, timepieces, and meaningful clocks.",
        profileId: "watch",
        iconKey: "watch",
        recommendedEvidenceTypes: [
          "Current photo",
          "Purchase receipt",
          "Service record",
          "Valuation",
        ],
      }),
      category("lifestyle.jewelry", "Jewelry", {
        aliases: ["jewellery", "ring", "necklace", "bracelet", "earrings", "gold"],
        description: "Jewelry, precious metal, and wearable valuables.",
        profileId: "jewelry",
        iconKey: "diamond",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt", "Valuation"],
      }),
      category("lifestyle.bag-fashion", "Bag or fashion item", {
        aliases: ["handbag", "bag", "shoes", "fashion", "designer clothing", "accessory"],
        description: "Designer bags, fashion, shoes, and accessories.",
        profileId: "general-physical",
        iconKey: "handbag",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt"],
      }),
      category("lifestyle.art", "Art", {
        aliases: ["painting", "sculpture", "print", "artwork", "fine art"],
        description: "Paintings, sculpture, prints, and other original artwork.",
        profileId: "art-collectible",
        iconKey: "palette",
        recommendedEvidenceTypes: ["Current photo", "Provenance record", "Valuation"],
      }),
      category("lifestyle.collectible", "Collectible", {
        aliases: ["collectibles", "collection", "memorabilia", "rare item", "trading card", "coin", "stamp"],
        description: "Collectibles, memorabilia, coins, cards, and limited editions.",
        profileId: "art-collectible",
        iconKey: "collectible",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt", "Provenance record"],
      }),
      category("lifestyle.sports-outdoor", "Sports or outdoor equipment", {
        aliases: ["sports gear", "golf", "camping", "fitness", "outdoor", "surfboard"],
        description: "Sports, fitness, camping, and outdoor equipment.",
        iconKey: "sport",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt"],
      }),
      category("lifestyle.instrument", "Musical instrument", {
        aliases: ["instrument", "guitar", "piano", "violin", "synthesizer", "music equipment"],
        description: "Musical instruments and significant studio equipment.",
        profileId: "general-physical",
        iconKey: "music",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt", "Service record"],
      }),
      category("lifestyle.books-media", "Book or physical media", {
        aliases: ["book", "books", "record", "vinyl", "cd", "dvd", "manuscript"],
        description: "Books, manuscripts, records, and physical media collections.",
        profileId: "art-collectible",
        iconKey: "book",
        recommendedEvidenceTypes: ["Current photo", "Provenance record"],
      }),
      category("lifestyle.camera", "Camera or optical equipment", {
        aliases: ["camera", "lens", "photography", "binoculars", "telescope"],
        description: "Cameras, lenses, and specialist optical equipment.",
        profileId: "electronics",
        iconKey: "camera",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt", "Service record"],
      }),
      category("lifestyle.personal-item", "Other personal item", {
        aliases: ["personal", "personal asset", "everyday carry", "personal item"],
        description: "A meaningful personal item that does not fit another leaf.",
        iconKey: "personal",
        recommendedEvidenceTypes: ["Current photo"],
      }),
    ],
  },
  {
    id: "home-physical",
    label: "Home & physical items",
    description: "Furniture, appliances, equipment, and everyday owned objects.",
    iconKey: "home-items",
    categories: [
      category("home.furniture", "Furniture", {
        aliases: ["chair", "table", "sofa", "desk", "cabinet", "bed"],
        description: "Furniture and significant fitted pieces.",
        iconKey: "chair",
      }),
      category("home.appliance", "Appliance", {
        aliases: ["appliances", "fridge", "refrigerator", "washing machine", "oven"],
        description: "Home and kitchen appliances.",
        profileId: "electronics",
        iconKey: "appliance",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt", "Warranty"],
      }),
      category("home.electronics", "Electronics or device", {
        aliases: ["electronics", "computer", "laptop", "phone", "tablet", "television", "tv"],
        description: "Computers, phones, displays, and other electronic devices.",
        profileId: "electronics",
        iconKey: "device",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt", "Warranty"],
      }),
      category("home.tools", "Tools or workshop equipment", {
        aliases: ["tool", "tools", "workshop", "power tool", "machinery"],
        description: "Hand tools, power tools, and workshop equipment.",
        iconKey: "tools",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt", "Service record"],
      }),
      category("home.kitchen-dining", "Kitchen or dining item", {
        aliases: ["kitchen", "dining", "cookware", "tableware", "silverware"],
        description: "Valuable cookware, tableware, and dining sets.",
        iconKey: "kitchen",
      }),
      category("home.decor", "Décor or household art", {
        aliases: ["decor", "decoration", "rug", "carpet", "lamp", "vase"],
        description: "Décor, rugs, lighting, and household display pieces.",
        iconKey: "decor",
      }),
      category("home.garden", "Garden or outdoor item", {
        aliases: ["garden", "outdoor furniture", "barbecue", "bbq", "landscaping equipment"],
        description: "Garden equipment, outdoor furniture, and exterior objects.",
        iconKey: "garden",
      }),
      category("home.other", "Other household item", {
        aliases: ["household", "physical item", "object", "belonging"],
        description: "An owned physical object that needs more classification.",
        iconKey: "box",
      }),
    ],
  },
  {
    id: "digital-financial",
    label: "Digital & financial",
    description: "Digital rights, accounts, investments, and safe references to financial holdings.",
    iconKey: "digital",
    categories: [
      category("digital.asset", "Digital asset", {
        aliases: ["digital", "digital item", "download", "virtual item"],
        description: "A digital file, right, or virtual item with enduring value.",
        profileId: "digital-asset",
        kind: "digital",
        iconKey: "digital-asset",
        recommendedEvidenceTypes: ["Ownership reference", "Recovery note"],
      }),
      category("digital.account-license", "Account or software license", {
        aliases: ["account", "license", "subscription", "software", "membership"],
        description: "An account, subscription, or license reference—never its password.",
        profileId: "digital-asset",
        kind: "digital",
        iconKey: "license",
        recommendedEvidenceTypes: ["Ownership reference", "Recovery note"],
      }),
      category("digital.domain-website", "Domain or website", {
        aliases: ["domain", "website", "web property", "hosting"],
        description: "A domain, website, or related web property.",
        profileId: "digital-asset",
        kind: "digital",
        iconKey: "globe",
        recommendedEvidenceTypes: ["Registration record", "Recovery note"],
      }),
      category("digital.crypto-reference", "Crypto or wallet reference", {
        aliases: ["crypto", "cryptocurrency", "wallet", "token", "nft"],
        description: "A safe ownership reference. Never store seed phrases or private keys.",
        profileId: "digital-asset",
        kind: "digital",
        iconKey: "wallet",
        recommendedEvidenceTypes: ["Ownership reference", "Recovery note"],
      }),
      category("digital.intellectual-property", "Intellectual property", {
        aliases: ["ip", "patent", "trademark", "copyright", "royalty", "rights"],
        description: "Patents, trademarks, copyright, and other registered or contractual rights.",
        profileId: "intellectual-property",
        kind: "intangible",
        iconKey: "certificate",
        recommendedEvidenceTypes: ["Registration record", "Ownership record"],
      }),
      category("financial.investment", "Investment", {
        aliases: ["shares", "stock", "fund", "bond", "portfolio", "investment account"],
        description: "A safe reference to an investment holding or account.",
        profileId: "financial-reference",
        kind: "financial",
        iconKey: "investment",
        recommendedEvidenceTypes: ["Ownership record", "Valuation"],
      }),
      category("financial.bank-reference", "Bank or cash account reference", {
        aliases: ["bank", "bank account", "cash account", "deposit", "savings"],
        description: "A masked reference to a bank or cash account—never credentials.",
        profileId: "financial-reference",
        kind: "financial",
        iconKey: "bank",
        recommendedEvidenceTypes: ["Ownership record", "Beneficiary note"],
      }),
      category("financial.policy-membership", "Policy or financial membership", {
        aliases: ["policy", "pension", "retirement", "benefit", "financial membership"],
        description: "A pension, policy, benefit, or other financial membership reference.",
        profileId: "financial-reference",
        kind: "financial",
        iconKey: "policy",
        recommendedEvidenceTypes: ["Policy document", "Beneficiary note"],
      }),
    ],
  },
  {
    id: "business-professional",
    label: "Business & professional",
    description: "Companies, equipment, inventory, agreements, and professional credentials.",
    iconKey: "business",
    categories: [
      category("business.company-interest", "Company or ownership interest", {
        aliases: ["company", "business", "partnership", "shareholding", "ownership interest"],
        description: "An ownership interest in a company, partnership, or venture.",
        profileId: "business-entity",
        kind: "intangible",
        iconKey: "company",
        recommendedEvidenceTypes: ["Ownership record", "Registration record", "Valuation"],
      }),
      category("business.equipment", "Business equipment", {
        aliases: ["equipment", "machine", "commercial equipment", "office equipment"],
        description: "Equipment owned for business or professional use.",
        iconKey: "equipment",
        recommendedEvidenceTypes: ["Current photo", "Purchase receipt", "Service record"],
      }),
      category("business.inventory", "Inventory or stock", {
        aliases: ["inventory", "stock", "goods", "merchandise"],
        description: "Grouped or individually significant business inventory.",
        iconKey: "inventory",
        recommendedEvidenceTypes: ["Inventory record", "Current photo"],
      }),
      category("business.contract", "Contract or agreement", {
        aliases: ["contract", "agreement", "lease", "memorandum"],
        description: "A significant active agreement or contractual right.",
        profileId: "document-record",
        kind: "document",
        iconKey: "contract",
        recommendedEvidenceTypes: ["Current document copy", "Signature record"],
      }),
      category("business.credential", "Professional credential", {
        aliases: ["credential", "qualification", "license", "certification", "certificate"],
        description: "A professional qualification, license, or certification.",
        profileId: "document-record",
        kind: "document",
        iconKey: "credential",
        recommendedEvidenceTypes: ["Current document copy", "Renewal record"],
      }),
      category("business.project", "Project or work product", {
        aliases: ["project", "work product", "portfolio work"],
        description: "A project, work product, or professional asset with continuity value.",
        profileId: "digital-asset",
        kind: "intangible",
        iconKey: "project",
        recommendedEvidenceTypes: ["Ownership reference", "Current snapshot"],
      }),
      category("business.other", "Other business asset", {
        aliases: ["business asset", "professional asset"],
        description: "A business or professional asset that needs more classification.",
        profileId: "business-entity",
        kind: "intangible",
        iconKey: "briefcase",
        recommendedEvidenceTypes: ["Ownership record"],
      }),
    ],
  },
  {
    id: "family-memory-legacy",
    label: "Family, memory & legacy",
    description: "Heirlooms, stories, family records, and objects whose meaning outlives their price.",
    iconKey: "legacy",
    categories: [
      category("legacy.heirloom", "Heirloom", {
        aliases: ["family heirloom", "inheritance", "inherited item"],
        description: "A physical item carried through a family or community.",
        profileId: "memory-legacy",
        iconKey: "heirloom",
        recommendedEvidenceTypes: ["Current photo", "Story note", "Provenance record"],
      }),
      category("legacy.photo-album", "Photo or album", {
        aliases: ["photo", "photograph", "album", "family photo", "video archive"],
        description: "A meaningful photograph, album, or family media collection.",
        profileId: "memory-legacy",
        iconKey: "photo",
        recommendedEvidenceTypes: ["Current copy", "Story note"],
      }),
      category("legacy.letter", "Letter or correspondence", {
        aliases: ["letter", "correspondence", "postcard", "diary", "journal"],
        description: "Letters, diaries, postcards, and meaningful correspondence.",
        profileId: "memory-legacy",
        iconKey: "letter",
        recommendedEvidenceTypes: ["Current copy", "Story note"],
      }),
      category("legacy.story-memory", "Story or memory", {
        aliases: ["story", "memory", "oral history", "recording", "interview"],
        description: "A memory, oral history, or story worth preserving.",
        profileId: "memory-legacy",
        kind: "memory",
        iconKey: "story",
        recommendedEvidenceTypes: ["Story note"],
      }),
      category("legacy.genealogy", "Genealogy or family record", {
        aliases: ["family tree", "genealogy", "ancestry", "family history"],
        description: "Family-tree research and supporting family history.",
        profileId: "memory-legacy",
        kind: "memory",
        iconKey: "family-tree",
        recommendedEvidenceTypes: ["Current copy", "Source reference"],
      }),
      category("legacy.time-capsule", "Time capsule or legacy collection", {
        aliases: ["time capsule", "legacy collection", "memory box", "archive box"],
        description: "A deliberately grouped collection for future family access.",
        profileId: "memory-legacy",
        iconKey: "archive",
        recommendedEvidenceTypes: ["Current photo", "Contents record", "Story note"],
      }),
    ],
  },
  {
    id: "documents-records",
    label: "Documents & records",
    description: "Identity, ownership, protection, maintenance, legal, and reference records.",
    iconKey: "records",
    categories: [
      category("record.identity", "Identity document", {
        aliases: ["identity", "id", "passport", "national id", "birth certificate"],
        description: "An identity or civil-status document record.",
        profileId: "document-record",
        kind: "document",
        iconKey: "identity",
        recommendedEvidenceTypes: ["Current document copy"],
      }),
      category("record.ownership-title", "Ownership or title record", {
        aliases: ["title", "title deed", "ownership", "certificate of ownership"],
        description: "A title, deed, or other authoritative ownership record.",
        profileId: "document-record",
        kind: "document",
        iconKey: "title",
        recommendedEvidenceTypes: ["Current document copy"],
      }),
      category("record.insurance", "Insurance record", {
        aliases: ["insurance", "insurance policy", "coverage", "proof of coverage"],
        description: "An insurance policy, schedule, or proof-of-coverage record.",
        profileId: "document-record",
        kind: "document",
        iconKey: "insurance",
        recommendedEvidenceTypes: ["Current document copy"],
      }),
      category("record.receipt-invoice", "Receipt or invoice", {
        aliases: ["receipt", "invoice", "bill", "purchase proof"],
        description: "A receipt, invoice, or other purchase record tracked as an asset.",
        profileId: "document-record",
        kind: "document",
        iconKey: "receipt",
        recommendedEvidenceTypes: ["Current document copy"],
      }),
      category("record.service-maintenance", "Service or maintenance record", {
        aliases: ["service", "maintenance", "repair", "service history"],
        description: "A service, maintenance, repair, or inspection record.",
        profileId: "document-record",
        kind: "document",
        iconKey: "service",
        recommendedEvidenceTypes: ["Current document copy"],
      }),
      category("record.valuation-appraisal", "Valuation or appraisal", {
        aliases: ["valuation", "appraisal", "estimate", "certificate of value"],
        description: "A professional valuation, appraisal, or estimate.",
        profileId: "document-record",
        kind: "document",
        iconKey: "valuation",
        recommendedEvidenceTypes: ["Current document copy"],
      }),
      category("record.legal-tax", "Legal or tax record", {
        aliases: ["legal", "tax", "will", "trust", "court", "filing"],
        description: "A legal, tax, estate, or regulatory record.",
        profileId: "document-record",
        kind: "document",
        iconKey: "legal",
        recommendedEvidenceTypes: ["Current document copy"],
      }),
      category("record.warranty-manual", "Warranty or manual", {
        aliases: ["warranty", "manual", "instructions", "guarantee"],
        description: "A product warranty, guarantee, or operating manual.",
        profileId: "document-record",
        kind: "document",
        iconKey: "manual",
        recommendedEvidenceTypes: ["Current document copy"],
      }),
      category("record.other-document", "Other document or record", {
        aliases: ["document", "paper", "papers", "record", "file"],
        description: "A document that needs more classification.",
        profileId: "document-record",
        kind: "document",
        iconKey: "document",
        recommendedEvidenceTypes: ["Current document copy"],
      }),
    ],
  },
  {
    id: "other-custom",
    label: "Other & custom",
    description: "Unusual assets and household-specific categories.",
    iconKey: "custom",
    categories: [
      category("custom.other", "Other or not yet classified", {
        aliases: ["other", "uncategorized", "unknown category", "custom"],
        description: "A temporary home for an asset until a better category is chosen.",
        iconKey: "other",
        recommendedEvidenceTypes: ["Current photo"],
      }),
    ],
  },
].map((group) => ({
  ...group,
  categories: group.categories.map((item) => ({
    ...item,
    groupId: group.id,
  })),
})));

/**
 * Materials belong to every asset regardless of category. Recommendations can
 * prioritize one kind, but the UI must never hide or disable another kind.
 */
export const MATERIAL_KINDS = deepFreeze([
  {
    id: "paper",
    label: "Paper or document",
    pluralLabel: "Papers & documents",
    description: "A scan, file, or photographed paper such as a receipt, title, policy, or certificate.",
    iconKey: "document",
    universal: true,
    acceptedSources: ["scan", "photo", "file", "metadata"],
  },
  {
    id: "artifact",
    label: "Physical artifact",
    pluralLabel: "Physical artifacts",
    description: "A supporting physical object whose identity, custody, and connection should be preserved.",
    iconKey: "artifact",
    universal: true,
    acceptedSources: ["photo", "metadata"],
  },
  {
    id: "media",
    label: "Photo, video, or audio",
    pluralLabel: "Photos & media",
    description: "Visual or audio evidence, condition capture, or a recording connected to the asset.",
    iconKey: "media",
    universal: true,
    acceptedSources: ["camera", "recording", "file", "metadata"],
  },
  {
    id: "note",
    label: "Note or story",
    pluralLabel: "Notes & stories",
    description: "Context, instructions, provenance, memories, or an explanation in the owner's words.",
    iconKey: "note",
    universal: true,
    acceptedSources: ["text", "dictation"],
  },
  {
    id: "link",
    label: "Link or reference",
    pluralLabel: "Links & references",
    description: "A safe external reference such as a registry page, listing, service portal, or public source.",
    iconKey: "link",
    universal: true,
    acceptedSources: ["url", "metadata"],
  },
  {
    id: "record",
    label: "Structured record",
    pluralLabel: "Structured records",
    description: "A dated service, valuation, movement, custody, or lifecycle event stored as structured metadata.",
    iconKey: "record",
    universal: true,
    acceptedSources: ["metadata"],
  },
]);

export const MATERIAL_RELATIONS = deepFreeze([
  {
    id: "ownership",
    label: "Ownership",
    description: "Shows acquisition, title, purchase, transfer, or beneficial ownership.",
  },
  {
    id: "identity",
    label: "Identity",
    description: "Helps distinguish this exact asset from similar assets.",
  },
  {
    id: "provenance",
    label: "Provenance",
    description: "Explains the asset's origin, history, or chain of custody.",
  },
  {
    id: "condition",
    label: "Condition",
    description: "Captures current state, damage, restoration, or inspection.",
  },
  {
    id: "service",
    label: "Service & maintenance",
    description: "Records service, repairs, inspections, and maintenance.",
  },
  {
    id: "insurance",
    label: "Insurance",
    description: "Records coverage, policy, claim, or protection details.",
  },
  {
    id: "valuation",
    label: "Valuation",
    description: "Supports an estimate, appraisal, or historical value.",
  },
  {
    id: "legal",
    label: "Legal & compliance",
    description: "Supports legal, regulatory, registration, or tax obligations.",
  },
  {
    id: "context",
    label: "Context & story",
    description: "Preserves meaning, memory, instructions, or family context.",
  },
  {
    id: "access",
    label: "Access & continuity",
    description: "Explains who can access or recover the asset without storing secrets.",
  },
  {
    id: "other",
    label: "Other relationship",
    description: "A supporting relationship that does not fit another option.",
  },
]);

const GROUP_BY_ID = new Map(
  ASSET_CATEGORY_GROUPS.map((group) => [group.id, group]),
);
const BUILT_IN_CATEGORIES = ASSET_CATEGORY_GROUPS.flatMap(
  (group) => group.categories,
);
const CATEGORY_BY_ID = new Map(
  BUILT_IN_CATEGORIES.map((item) => [item.id, item]),
);
const PROFILE_BY_ID = new Map(
  CATEGORY_PROFILES.map((profile) => [profile.id, profile]),
);
const MATERIAL_KIND_BY_ID = new Map(
  MATERIAL_KINDS.map((kind) => [kind.id, kind]),
);
const MATERIAL_RELATION_BY_ID = new Map(
  MATERIAL_RELATIONS.map((relation) => [relation.id, relation]),
);

function groupFor(category) {
  return (
    GROUP_BY_ID.get(category.groupId) ??
    GROUP_BY_ID.get("other-custom")
  );
}

function enrichCategory(category) {
  const group = groupFor(category);
  return {
    ...category,
    groupLabel: group.label,
    pathLabel: `${group.label} / ${category.label}`,
  };
}

function stableSlug(value) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  if (normalized) return normalized;

  // Deterministic fallback for names with no Latin characters.
  let hash = 2166136261;
  for (const character of String(value ?? "").normalize("NFKC")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `category-${(hash >>> 0).toString(36)}`;
}

/**
 * Creates a serializable custom leaf without mutating the built-in taxonomy.
 * The deterministic ID makes a custom category portable across local clients;
 * callers may provide their own persisted ID when duplicate labels are needed.
 */
export function createCustomAssetCategory(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("A custom category object is required.");
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    throw new TypeError("A custom category needs a name.");
  }

  const requestedId =
    typeof input.id === "string" ? input.id.trim().replace(/^custom[.:/-]*/i, "") : "";
  const id = `custom.${stableSlug(requestedId || name)}`;
  if (CATEGORY_BY_ID.has(id)) {
    throw new TypeError(`The category ID "${id}" is reserved.`);
  }

  const groupId = GROUP_BY_ID.has(input.groupId)
    ? input.groupId
    : "other-custom";
  const profileId = PROFILE_BY_ID.has(input.profileId)
    ? input.profileId
    : "general-physical";
  const allowedKinds = new Set([
    "physical",
    "real-estate",
    "digital",
    "financial",
    "intangible",
    "document",
    "memory",
  ]);
  const kind = allowedKinds.has(input.kind) ? input.kind : "physical";

  return deepFreeze({
    id,
    groupId,
    label: name,
    aliases: uniqueText(input.aliases),
    description:
      typeof input.description === "string"
        ? input.description.trim()
        : "",
    profileId,
    kind,
    iconKey:
      typeof input.iconKey === "string" && input.iconKey.trim()
        ? input.iconKey.trim()
        : "custom",
    recommendedEvidenceTypes: uniqueText(input.recommendedEvidenceTypes).length
      ? uniqueText(input.recommendedEvidenceTypes)
      : ["Current photo"],
    isCustom: true,
  });
}

function normalizeCustomCategories(customCategories) {
  if (!Array.isArray(customCategories)) return [];

  const output = [];
  const seen = new Set(CATEGORY_BY_ID.keys());
  for (const candidate of customCategories) {
    try {
      const category = createCustomAssetCategory({
        ...candidate,
        name: candidate?.name ?? candidate?.label,
      });
      if (seen.has(category.id)) continue;
      seen.add(category.id);
      output.push(category);
    } catch {
      // One malformed local custom category must not break the picker.
    }
  }
  return output;
}

/**
 * Returns all built-in leaves plus validated custom leaves. The output remains
 * flat for list/picker use; `groupId`, `groupLabel`, and `pathLabel` preserve
 * hierarchy without forcing a presentation shape.
 */
export function listAssetCategories({ customCategories = [] } = {}) {
  return [
    ...BUILT_IN_CATEGORIES,
    ...normalizeCustomCategories(customCategories),
  ].map(enrichCategory);
}

export function resolveAssetCategory(
  ref,
  { customCategories = [] } = {},
) {
  const requested =
    ref && typeof ref === "object"
      ? ref.id ?? ref.categoryId ?? ref.label
      : ref;
  if (typeof requested !== "string" || !requested.trim()) return null;

  const direct = CATEGORY_BY_ID.get(requested.trim());
  if (direct) return direct;

  const normalized = normalizeSearchText(requested);
  return (
    [
      ...BUILT_IN_CATEGORIES,
      ...normalizeCustomCategories(customCategories),
    ].find((category) => {
      if (normalizeSearchText(category.id) === normalized) return true;
      if (normalizeSearchText(category.label) === normalized) return true;
      return category.aliases.some(
        (alias) => normalizeSearchText(alias) === normalized,
      );
    }) ?? null
  );
}

export function getAssetCategory(
  ref,
  { customCategories = [] } = {},
) {
  const category = resolveAssetCategory(ref, { customCategories });
  return category ? enrichCategory(category) : null;
}

export function getAssetCategoryPath(
  ref,
  { customCategories = [] } = {},
) {
  const category = resolveAssetCategory(ref, { customCategories });
  if (!category) return null;
  const group = groupFor(category);

  return {
    groupId: group.id,
    groupLabel: group.label,
    categoryId: category.id,
    categoryLabel: category.label,
    ids: [group.id, category.id],
    labels: [group.label, category.label],
    label: `${group.label} / ${category.label}`,
  };
}

export function getCategoryProfile(
  ref,
  { customCategories = [] } = {},
) {
  if (typeof ref === "string" && PROFILE_BY_ID.has(ref)) {
    return PROFILE_BY_ID.get(ref);
  }
  const category = resolveAssetCategory(ref, { customCategories });
  return category
    ? PROFILE_BY_ID.get(category.profileId) ??
        PROFILE_BY_ID.get("general-physical")
    : null;
}

function categorySearchScore(category, group, query) {
  const normalizedLabel = normalizeSearchText(category.label);
  const normalizedId = normalizeSearchText(category.id);
  const normalizedAliases = category.aliases.map(normalizeSearchText);
  const normalizedGroup = normalizeSearchText(group.label);
  const searchable = normalizeSearchText(
    [
      category.label,
      category.id,
      category.description,
      group.label,
      ...category.aliases,
    ].join(" "),
  );
  const queryTokens = query.split(" ").filter(Boolean);

  if (normalizedLabel === query) return { score: 120, matchedOn: "label" };
  if (normalizedAliases.includes(query)) {
    return { score: 115, matchedOn: "alias" };
  }
  if (normalizedId === query) return { score: 110, matchedOn: "id" };
  if (normalizedLabel.startsWith(query)) {
    return { score: 100, matchedOn: "label" };
  }
  if (normalizedAliases.some((alias) => alias.startsWith(query))) {
    return { score: 95, matchedOn: "alias" };
  }
  if (normalizedGroup === query) {
    return { score: 85, matchedOn: "group" };
  }
  if (queryTokens.every((token) => searchable.includes(token))) {
    const labelBonus = normalizedLabel.includes(query) ? 10 : 0;
    const aliasBonus = normalizedAliases.some((alias) => alias.includes(query))
      ? 6
      : 0;
    return {
      score: 70 + labelBonus + aliasBonus,
      matchedOn: labelBonus ? "label" : aliasBonus ? "alias" : "keywords",
    };
  }
  return null;
}

/**
 * Search results are category records enriched with group/path labels and
 * deterministic ranking metadata (`searchScore`, `matchedOn`).
 */
export function searchAssetCategories(
  query,
  { limit = 24, customCategories = [] } = {},
) {
  const normalized = normalizeSearchText(query);
  const safeLimit =
    Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 24;
  const catalog = listAssetCategories({ customCategories });

  if (!normalized) {
    return catalog.slice(0, safeLimit).map((item) => ({
      ...item,
      searchScore: 0,
      matchedOn: null,
    }));
  }

  return catalog
    .map((item, index) => {
      const group = GROUP_BY_ID.get(item.groupId) ?? GROUP_BY_ID.get("other-custom");
      const match = categorySearchScore(item, group, normalized);
      return match
        ? {
            ...item,
            searchScore: match.score,
            matchedOn: match.matchedOn,
            catalogOrder: index,
          }
        : null;
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.searchScore - left.searchScore ||
        left.catalogOrder - right.catalogOrder,
    )
    .slice(0, safeLimit)
    .map(({ catalogOrder, ...item }) => item);
}

/**
 * Resolves a persisted recent-ID list while preserving order and uniqueness.
 * Legacy category labels are accepted so old local snapshots remain useful.
 */
export function getRecentAssetCategories(
  refs,
  { limit = 6, customCategories = [] } = {},
) {
  if (!Array.isArray(refs)) return [];
  const safeLimit =
    Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 6;
  const seen = new Set();
  const output = [];

  for (const ref of refs) {
    const category = resolveAssetCategory(ref, { customCategories });
    if (!category || seen.has(category.id)) continue;
    seen.add(category.id);
    output.push(enrichCategory(category));
    if (output.length >= safeLimit) break;
  }

  return output;
}

export function getMaterialKind(id) {
  return typeof id === "string"
    ? MATERIAL_KIND_BY_ID.get(id.trim()) ?? null
    : null;
}

export function getMaterialRelation(id) {
  return typeof id === "string"
    ? MATERIAL_RELATION_BY_ID.get(id.trim()) ?? null
    : null;
}
