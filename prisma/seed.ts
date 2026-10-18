import "dotenv/config";
import { prisma } from "@/lib/db";

/**
 * Minimal reference data so search works before the first agency sync
 * (`pnpm ingest usaspending-agencies` replaces it with the authoritative list).
 * Codes are USAspending toptier (CGAC) agency codes.
 */
const AGENCIES: [code: string, name: string, abbreviation: string][] = [
  ["012", "Department of Agriculture", "USDA"],
  ["013", "Department of Commerce", "DOC"],
  ["014", "Department of the Interior", "DOI"],
  ["015", "Department of Justice", "DOJ"],
  ["016", "Department of Labor", "DOL"],
  ["019", "Department of State", "DOS"],
  ["020", "Department of the Treasury", "TREAS"],
  ["036", "Department of Veterans Affairs", "VA"],
  ["047", "General Services Administration", "GSA"],
  ["049", "National Science Foundation", "NSF"],
  ["068", "Environmental Protection Agency", "EPA"],
  ["069", "Department of Transportation", "DOT"],
  ["070", "Department of Homeland Security", "DHS"],
  ["073", "Small Business Administration", "SBA"],
  ["075", "Department of Health and Human Services", "HHS"],
  ["080", "National Aeronautics and Space Administration", "NASA"],
  ["086", "Department of Housing and Urban Development", "HUD"],
  ["089", "Department of Energy", "DOE"],
  ["091", "Department of Education", "ED"],
  ["097", "Department of Defense", "DOD"],
];

async function main() {
  for (const [code, name, abbreviation] of AGENCIES) {
    await prisma.agency.upsert({
      where: { code },
      create: { code, name, abbreviation },
      update: { abbreviation },
    });
  }
  console.log(`seeded ${AGENCIES.length} agencies`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
