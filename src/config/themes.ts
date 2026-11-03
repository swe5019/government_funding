import type { ProgramConfig } from "./programs";

/**
 * Investing sectors, matched by awarding agency, industry codes (NAICS, PSC) and description
 * keywords. These are classification and keyword matches, not official programs: every theme's
 * description says so, and it may include unrelated awards or miss awards with vague text.
 * Agency codes are USAspending toptier codes.
 */
const A = {
  DOD: "097",
  NASA: "080",
  DOE: "089",
  NSF: "049",
  HHS: "075",
  COMMERCE: "013",
  DHS: "070",
  VA: "036",
  USDA: "012",
  DOJ: "015",
  DOT: "069",
  EPA: "068",
  INTERIOR: "014",
  GSA: "047",
  TREASURY: "020",
  STATE: "019",
} as const;

const caveat =
  "This is a keyword and industry-code match on award records, not an official program: it can include unrelated awards and miss awards with vague descriptions.";

export const themes: ProgramConfig[] = [
  {
    slug: "space",
    kind: "theme",
    name: "Space",
    description: `Every NASA award, plus contracts and grants for satellites, launch, spacecraft and space domain awareness from the Defense Department (including the Space Force), Commerce and Homeland Security, and anything coded as space vehicles or space R&D. ${caveat}`,
    sourceUrl: "https://www.nasa.gov/budgets-plans-and-reports/",
    rules: {
      allFromAgencies: [A.NASA],
      naicsPrefixes: ["336414", "336415", "336419", "517410"],
      pscPrefixes: ["AR", "18"],
      agencyCodes: [A.DOD, A.COMMERCE, A.DHS],
      keywords: ["satellite", "spacecraft", "launch vehicle", "space launch", "space force", "space domain awareness", "lunar", "geosynchronous", "low earth orbit"],
      excludeKeywords: ["satellite office", "satellite clinic", "satellite campus", "satellite location", "satellite facility"],
    },
  },
  {
    slug: "ai",
    kind: "theme",
    name: "Artificial intelligence",
    description: `Contracts and grants whose descriptions mention artificial intelligence, machine learning, large language models, computer vision or related methods, from the agencies that buy and fund most AI work. ${caveat}`,
    sourceUrl: "https://www.ai.gov",
    rules: {
      agencyCodes: [A.DOD, A.DOE, A.NSF, A.HHS, A.COMMERCE, A.DHS, A.VA, A.GSA, A.TREASURY, A.NASA, A.DOJ, A.STATE],
      keywords: [
        "artificial intelligence",
        "machine learning",
        "deep learning",
        "neural network",
        "large language model",
        "generative ai",
        "computer vision",
        "natural language processing",
      ],
    },
  },
  {
    slug: "health-biotech",
    kind: "theme",
    name: "Health & biotech",
    description: `Pharmaceutical, biotech, diagnostics and medical-device awards: industry codes for drug manufacturing, biotech R&D, medical equipment and labs, plus Health and Human Services (NIH, BARDA, CDC), Defense, Veterans Affairs and Homeland Security awards for vaccines, therapeutics, diagnostics and clinical trials. Grants to universities and hospitals count in the totals but are not public companies. ${caveat}`,
    sourceUrl: "https://www.hhs.gov",
    rules: {
      naicsPrefixes: ["3254", "541714", "3391", "621511"],
      pscPrefixes: ["65", "AN"],
      agencyCodes: [A.HHS, A.DOD, A.VA, A.DHS],
      keywords: ["vaccine", "therapeutic", "clinical trial", "drug development", "diagnostic", "medical countermeasure", "biomanufacturing", "antiviral", "monoclonal"],
    },
  },
  {
    slug: "hypersonics",
    kind: "theme",
    name: "Hypersonics",
    description: `Defense, NASA and Energy awards mentioning hypersonic weapons, vehicles and propulsion. ${caveat}`,
    sourceUrl: "https://www.defense.gov",
    rules: { agencyCodes: [A.DOD, A.NASA, A.DOE], keywords: ["hypersonic", "scramjet", "boost glide", "glide body"] },
  },
  {
    slug: "drones",
    kind: "theme",
    name: "Drones & counter-drone",
    description: `Awards for unmanned aircraft, surface and underwater vehicles, loitering munitions and counter-drone systems from Defense, Homeland Security, Justice, Transportation, Agriculture and Interior. ${caveat}`,
    sourceUrl: "https://www.defense.gov",
    rules: {
      agencyCodes: [A.DOD, A.DHS, A.DOJ, A.DOT, A.USDA, A.INTERIOR],
      keywords: ["unmanned aircraft", "unmanned aerial", "unmanned surface", "unmanned underwater", "uas", "suas", "c-uas", "counter-uas", "drone", "loitering munition"],
      // UASI is a DHS grant program (Urban Area Security Initiative), not drones.
      excludeKeywords: ["uasi", "urban area security"],
    },
  },
  {
    slug: "shipbuilding",
    kind: "theme",
    name: "Shipbuilding",
    description: `Navy and Coast Guard shipbuilding: shipyard industry codes, ship and marine equipment, and awards for submarines, destroyers, frigates and amphibious ships. ${caveat}`,
    sourceUrl: "https://www.navy.mil",
    rules: {
      naicsPrefixes: ["336611"],
      pscPrefixes: ["19", "20"],
      agencyCodes: [A.DOD, A.DHS],
      keywords: ["shipbuilding", "ship construction", "submarine construction", "destroyer", "frigate", "amphibious assault ship", "virginia class", "columbia class"],
    },
  },
  {
    slug: "munitions-missiles",
    kind: "theme",
    name: "Munitions & missiles",
    description: `Ammunition, explosives, guided missiles and interceptors: industry codes for ammunition and missile manufacturing, plus Defense awards that mention munitions, missiles or artillery. ${caveat}`,
    sourceUrl: "https://www.defense.gov",
    rules: {
      naicsPrefixes: ["332992", "332993", "332994", "336414"],
      pscPrefixes: ["13", "14"],
      agencyCodes: [A.DOD],
      keywords: ["munition", "missile", "ammunition", "artillery", "warhead", "interceptor"],
    },
  },
  {
    slug: "cybersecurity",
    kind: "theme",
    name: "Cybersecurity",
    description: `IT security services and awards mentioning cybersecurity, zero trust, intrusion detection, penetration testing or security operations across the major civilian and defense agencies. ${caveat}`,
    sourceUrl: "https://www.cisa.gov",
    rules: {
      pscPrefixes: ["DJ"],
      agencyCodes: [A.DOD, A.DHS, A.TREASURY, A.HHS, A.VA, A.GSA, A.DOE, A.DOJ, A.STATE, A.COMMERCE],
      keywords: ["cybersecurity", "cyber security", "zero trust", "intrusion detection", "cyber defense", "penetration test", "vulnerability assessment", "endpoint detection", "security operations center"],
    },
  },
  {
    slug: "nuclear",
    kind: "theme",
    name: "Nuclear energy",
    description: `Civilian nuclear power: small modular and advanced reactors, microreactors, nuclear fuel (including HALEU) and fusion, from Energy, Defense and NASA, plus nuclear power plant operators. ${caveat}`,
    sourceUrl: "https://www.energy.gov/ne/office-nuclear-energy",
    rules: {
      naicsPrefixes: ["221113"],
      agencyCodes: [A.DOE, A.DOD, A.NASA],
      keywords: ["small modular reactor", "advanced reactor", "microreactor", "nuclear reactor", "nuclear fuel", "haleu", "high-assay low-enriched", "fusion energy", "nuclear power"],
    },
  },
  {
    slug: "critical-minerals",
    kind: "theme",
    name: "Critical minerals",
    description: `Mining, processing and supply-chain awards for critical minerals (rare earths, lithium, graphite, cobalt, nickel, antimony, gallium, germanium, tungsten) from Energy, Defense, Interior, Commerce and Agriculture. ${caveat}`,
    sourceUrl: "https://www.usgs.gov/programs/mineral-resources-program",
    rules: {
      agencyCodes: [A.DOE, A.DOD, A.INTERIOR, A.COMMERCE, A.USDA],
      keywords: ["critical mineral", "rare earth", "lithium", "graphite", "cobalt", "nickel", "antimony", "gallium", "germanium", "tungsten"],
    },
  },
  {
    slug: "batteries-ev",
    kind: "theme",
    name: "Batteries & EVs",
    description: `Battery manufacturing, energy storage, electric vehicles and charging from Energy, Transportation, EPA and GSA. Defense is left out because "battery" there usually means an artillery or missile battery. ${caveat}`,
    sourceUrl: "https://www.energy.gov/eere/vehicles",
    rules: {
      agencyCodes: [A.DOE, A.DOT, A.EPA, A.GSA],
      keywords: ["battery", "batteries", "electric vehicle", "ev charging", "charging infrastructure", "zero-emission bus", "zero emission vehicle", "energy storage"],
    },
  },
  {
    slug: "clean-energy",
    kind: "theme",
    name: "Clean energy & grid",
    description: `Hydrogen hubs and electrolyzers, grid resilience and transmission, solar, wind, geothermal and carbon capture, from Energy, Agriculture, Interior and EPA. ${caveat}`,
    sourceUrl: "https://www.energy.gov",
    rules: {
      agencyCodes: [A.DOE, A.USDA, A.INTERIOR, A.EPA],
      keywords: ["clean hydrogen", "hydrogen hub", "electrolyzer", "grid resilience", "transmission line", "solar", "wind energy", "offshore wind", "geothermal", "carbon capture", "direct air capture"],
    },
  },
  {
    slug: "cannabis",
    kind: "theme",
    name: "Cannabis",
    description: `Awards mentioning cannabis, marijuana, cannabinoids, CBD or hemp. Cannabis is still federally restricted, so nearly all federal money here is research grants (mostly NIH) to universities, plus USDA hemp programs; public cannabis companies rarely receive federal awards. ${caveat}`,
    sourceUrl: "https://nida.nih.gov/research-topics/cannabis-marijuana",
    rules: {
      agencyCodes: [A.HHS, A.USDA, A.DOJ, A.VA, A.DOD, A.NSF],
      keywords: ["cannabis", "marijuana", "cannabinoid", "cbd", "tetrahydrocannabinol", "hemp"],
      excludeKeywords: ["hempstead"],
    },
  },
];
