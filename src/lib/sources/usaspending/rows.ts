import { dataConfig } from "@/config/data";
import { normalizeName, recipientKey } from "@/lib/mapping/normalize";

/**
 * Maps one row of a USAspending prime-transaction CSV (bulk download, contracts or
 * assistance) to the records we store. Column names have changed over time
 * (e.g. cfda_number -> assistance_listing_number), so each field lists the names we accept.
 */

export type RawRow = Record<string, string | undefined>;

export type FileKind = "contracts" | "assistance";

export type AwardCategory =
  | "CONTRACT"
  | "IDV"
  | "GRANT"
  | "LOAN"
  | "DIRECT_PAYMENT"
  | "INSURANCE"
  | "OTHER";

export type RecipientType =
  | "BUSINESS"
  | "NONPROFIT"
  | "GOVERNMENT"
  | "HIGHER_ED"
  | "INDIVIDUAL"
  | "OTHER"
  | "UNKNOWN";

export interface ParsedTransaction {
  transaction: {
    id: string;
    awardId: string;
    modNumber: string | null;
    actionDate: string;
    obligation: string;
    actionType: string | null;
    description: string | null;
    lastModifiedDate: string;
  };
  award: {
    id: string;
    displayId: string | null;
    category: AwardCategory;
    typeCode: string | null;
    description: string | null;
    recipientId: string;
    awardingAgencyCode: string | null;
    awardingSubCode: string | null;
    fundingAgencyCode: string | null;
    naicsCode: string | null;
    pscCode: string | null;
    assistanceListing: string | null;
    defCodes: string[];
    totalObligated: string;
    potentialValue: string | null;
    startDate: string | null;
    endDate: string | null;
    lastModifiedDate: string;
    sourceUrl: string;
  };
  recipient: {
    id: string;
    uei: string | null;
    duns: string | null;
    name: string;
    normalizedName: string;
    parentUei: string | null;
    parentName: string | null;
    recipientType: RecipientType;
    stateCode: string | null;
    countryCode: string | null;
  };
  agencies: { code: string; name: string }[];
  subAgencies: { code: string; name: string; agencyCode: string }[];
}

export class RowError extends Error {}

function pick(row: RawRow, ...names: string[]): string | null {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return null;
}

function required(row: RawRow, ...names: string[]): string {
  const v = pick(row, ...names);
  if (v === null) throw new RowError(`missing ${names[0]}`);
  return v;
}

/** "2024-03-05", "2024-03-05 12:00:00" or "2024-03-05T12:00:00Z" -> "2024-03-05" */
export function toDate(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : null;
}

/** Validates a money string; returns a canonical decimal string or null. */
export function toMoney(v: string | null): string | null {
  if (v === null) return null;
  const cleaned = v.replace(/[$,]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return cleaned;
}

function isTrue(v: string | null): boolean {
  return v !== null && /^(t|true|y|yes|1)$/i.test(v);
}

const CONTRACT_TYPE_CODES = new Set(["A", "B", "C", "D"]);

export function categorize(kind: FileKind, typeCode: string | null): AwardCategory {
  if (kind === "contracts") {
    if (typeCode && CONTRACT_TYPE_CODES.has(typeCode)) return "CONTRACT";
    if (typeCode?.startsWith("IDV")) return "IDV";
    return "CONTRACT";
  }
  switch (typeCode) {
    case "02":
    case "03":
    case "04":
    case "05":
      return "GRANT";
    case "07":
    case "08":
      return "LOAN";
    case "06":
    case "10":
      return "DIRECT_PAYMENT";
    case "09":
      return "INSURANCE";
    default:
      return "OTHER";
  }
}

const INDIVIDUAL_NAMES = /^(MULTIPLE RECIPIENTS|REDACTED DUE TO PII|PRIVATE INDIVIDUAL)/i;

export function classifyRecipient(kind: FileKind, row: RawRow, name: string): RecipientType {
  if (INDIVIDUAL_NAMES.test(name)) return "INDIVIDUAL";

  if (kind === "assistance") {
    const desc = (pick(row, "business_types_description", "business_types") ?? "").toLowerCase();
    if (!desc) return "UNKNOWN";
    if (desc.includes("individual")) return "INDIVIDUAL";
    if (desc.includes("higher education") && !desc.includes("other than an institution of higher education"))
      return "HIGHER_ED";
    if (desc.includes("for-profit") || desc.includes("for profit") || desc.includes("small business"))
      return "BUSINESS";
    if (desc.includes("nonprofit") || desc.includes("non-profit")) return "NONPROFIT";
    if (/government|tribal|authority|school district|township|county|municipal/.test(desc))
      return "GOVERNMENT";
    return "OTHER";
  }

  // Contracts carry yes/no flags per entity type.
  if (isTrue(pick(row, "educational_institution", "college_or_university"))) return "HIGHER_ED";
  if (isTrue(pick(row, "nonprofit_organization", "other_not_for_profit_organization")))
    return "NONPROFIT";
  if (
    isTrue(pick(row, "us_state_government")) ||
    isTrue(pick(row, "us_local_government")) ||
    isTrue(pick(row, "us_federal_government")) ||
    isTrue(pick(row, "foreign_government"))
  )
    return "GOVERNMENT";
  return "BUSINESS";
}

export function parseRow(kind: FileKind, row: RawRow): ParsedTransaction {
  const awardId =
    kind === "contracts"
      ? required(row, "contract_award_unique_key", "generated_unique_award_id")
      : required(row, "assistance_award_unique_key", "generated_unique_award_id");
  const txId =
    kind === "contracts"
      ? required(row, "contract_transaction_unique_key", "transaction_unique_key")
      : required(row, "assistance_transaction_unique_key", "transaction_unique_key");

  const actionDate = toDate(required(row, "action_date"));
  if (!actionDate) throw new RowError("bad action_date");
  const lastModifiedDate = toDate(pick(row, "last_modified_date")) ?? actionDate;

  const obligation = toMoney(pick(row, "federal_action_obligation")) ?? "0";
  const totalObligated =
    toMoney(pick(row, "total_dollars_obligated", "total_obligated_amount")) ?? obligation;

  const typeCode =
    kind === "contracts"
      ? pick(row, "award_type_code", "idv_type_code")
      : pick(row, "assistance_type_code", "award_type_code");

  const recipientName =
    pick(row, "recipient_name", "recipient_name_raw") ?? "UNKNOWN RECIPIENT";
  const uei = pick(row, "recipient_uei")?.toUpperCase() ?? null;
  const stateCode = pick(row, "recipient_state_code");
  const countryCode = pick(row, "recipient_country_code");
  const recipientId = recipientKey({ uei, name: recipientName, stateCode, countryCode });

  // Only reference agencies we can also upsert (code + name), so foreign keys always hold.
  const agencies: ParsedTransaction["agencies"] = [];
  const subAgencies: ParsedTransaction["subAgencies"] = [];
  const awardingCode = pick(row, "awarding_agency_code");
  const awardingName = pick(row, "awarding_agency_name");
  const awardingAgencyCode = awardingCode && awardingName ? awardingCode : null;
  if (awardingAgencyCode) agencies.push({ code: awardingAgencyCode, name: awardingName! });
  const fundingCode = pick(row, "funding_agency_code");
  const fundingName = pick(row, "funding_agency_name");
  const fundingAgencyCode = fundingCode && fundingName ? fundingCode : null;
  if (fundingAgencyCode) agencies.push({ code: fundingAgencyCode, name: fundingName! });
  const subCode = pick(row, "awarding_sub_agency_code");
  const subName = pick(row, "awarding_sub_agency_name");
  const awardingSubCode = subCode && subName && awardingAgencyCode ? subCode : null;
  if (awardingSubCode)
    subAgencies.push({ code: awardingSubCode, name: subName!, agencyCode: awardingAgencyCode! });

  const defCodes = (pick(row, "disaster_emergency_fund_codes_for_overall_award") ?? "")
    .split(/[;,]/)
    .map((s) => s.trim().split(":")[0].trim())
    .filter(Boolean);

  const permalink = pick(row, "usaspending_permalink");
  const sourceUrl =
    permalink && permalink.startsWith("https://")
      ? permalink
      : dataConfig.usaspending.awardUrlBase + encodeURIComponent(awardId);

  return {
    transaction: {
      id: txId,
      awardId,
      modNumber: pick(row, "modification_number"),
      actionDate,
      obligation,
      actionType: pick(row, "action_type_code", "action_type"),
      description: pick(row, "transaction_description"),
      lastModifiedDate,
    },
    award: {
      id: awardId,
      displayId:
        kind === "contracts"
          ? pick(row, "award_id_piid")
          : pick(row, "award_id_fain", "award_id_uri"),
      category: categorize(kind, typeCode),
      typeCode,
      description: pick(row, "prime_award_base_transaction_description", "transaction_description"),
      recipientId,
      awardingAgencyCode,
      awardingSubCode,
      fundingAgencyCode,
      naicsCode: pick(row, "naics_code"),
      pscCode: pick(row, "product_or_service_code"),
      assistanceListing: pick(row, "assistance_listing_number", "cfda_number"),
      defCodes,
      totalObligated,
      potentialValue: toMoney(
        pick(row, "potential_total_value_of_award", "total_face_value_of_loan"),
      ),
      startDate: toDate(pick(row, "period_of_performance_start_date")),
      endDate: toDate(pick(row, "period_of_performance_current_end_date")),
      lastModifiedDate,
      sourceUrl,
    },
    recipient: {
      id: recipientId,
      uei,
      duns: pick(row, "recipient_duns"),
      name: recipientName,
      normalizedName: normalizeName(recipientName),
      parentUei: pick(row, "recipient_parent_uei")?.toUpperCase() ?? null,
      parentName: pick(row, "recipient_parent_name"),
      recipientType: classifyRecipient(kind, row, recipientName),
      stateCode,
      countryCode,
    },
    agencies,
    subAgencies,
  };
}

/** Bulk-download zips contain one or more CSV parts per kind. */
export function fileKindFromName(name: string): FileKind | null {
  if (/contracts?_primetransactions/i.test(name)) return "contracts";
  if (/assistance_primetransactions/i.test(name)) return "assistance";
  return null;
}
