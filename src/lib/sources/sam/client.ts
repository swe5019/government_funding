import { createJsonFetcher } from "@/lib/sources/http";

/**
 * SAM.gov Entity Management API v3 (public data). Requires a free api.data.gov key from a
 * SAM.gov account; default keys are limited to ~10 requests/day, entity-role keys ~1,000/day.
 * Docs: https://open.gsa.gov/api/entity-api/
 */

const BASE = "https://api.sam.gov/entity-information/v3/entities";
const getJson = createJsonFetcher({ minGapMs: 1_000 });

export interface SamParents {
  uei: string;
  legalBusinessName: string | null;
  immediateParentUei: string | null;
  immediateParentName: string | null;
  ultimateParentUei: string | null;
  ultimateParentName: string | null;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Find the first nested object under any of `keys` (SAM has moved these fields between versions). */
function find(root: Json | null, keys: string[]): Json | null {
  if (!root) return null;
  for (const k of keys) {
    const v = obj(root[k]);
    if (v) return v;
  }
  for (const v of Object.values(root)) {
    const nested = obj(v);
    if (nested) {
      const hit = find(nested, keys);
      if (hit) return hit;
    }
  }
  return null;
}

function parentFrom(node: Json | null): { uei: string | null; name: string | null } {
  return {
    uei: str(node?.ueiSAM) ?? str(node?.uei) ?? null,
    name: str(node?.legalBusinessName) ?? str(node?.name) ?? null,
  };
}

/**
 * Pull corporate-hierarchy fields out of an entity record. Returns nulls for parents when the
 * record doesn't carry them (common at the public access tier), never throws on shape changes.
 */
export function parseEntity(entity: Json): SamParents | null {
  const reg = find(entity, ["entityRegistration"]);
  const uei = str(reg?.ueiSAM);
  if (!uei) return null;
  const immediate = parentFrom(find(entity, ["immediateParentEntity", "immediateParentEntityInformation"]));
  const ultimate = parentFrom(find(entity, ["ultimateParentEntity", "ultimateParentEntityInformation", "highestLevelOwner"]));
  return {
    uei: uei.toUpperCase(),
    legalBusinessName: str(reg?.legalBusinessName),
    immediateParentUei: immediate.uei?.toUpperCase() ?? null,
    immediateParentName: immediate.name,
    ultimateParentUei: ultimate.uei?.toUpperCase() ?? null,
    ultimateParentName: ultimate.name,
  };
}

export async function fetchEntityParents(uei: string, apiKey: string): Promise<SamParents | null> {
  const url = `${BASE}?api_key=${encodeURIComponent(apiKey)}&ueiSAM=${encodeURIComponent(uei)}&includeSections=entityRegistration,coreData`;
  const res = await getJson<{ entityData?: Json[] }>(url);
  const entity = res.entityData?.[0];
  return entity ? parseEntity(entity) : null;
}
