import { dataConfig } from "@/config/data";
import { createJsonFetcher } from "@/lib/sources/http";

/**
 * SAM.gov Get Opportunities API v2, award notices only (ptype=a). Same api.data.gov key and
 * daily quota as the entity API. https://open.gsa.gov/api/get-opportunities-public-api/
 */
const getJson = createJsonFetcher({ minGapMs: 1_000 });

export interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string | null;
  fullParentPathName?: string | null;
  postedDate: string;
  naicsCode?: string | null;
  uiLink?: string | null;
  award?: {
    date?: string | null;
    number?: string | null;
    amount?: string | number | null;
    awardee?: { name?: string | null; ueiSAM?: string | null } | null;
  } | null;
}

export interface SamAwardNoticeRow {
  noticeId: string;
  title: string;
  solicitationNumber: string | null;
  postedDate: string;
  awardDate: string | null;
  awardNumber: string | null;
  amount: number | null;
  awardeeName: string | null;
  awardeeUei: string | null;
  department: string | null;
  office: string | null;
  naicsCode: string | null;
  url: string;
}

/** MM/dd/yyyy, as the API requires. */
export const samDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

export function toAwardNotice(o: SamOpportunity): SamAwardNoticeRow | null {
  if (!o.noticeId || !o.title || !o.postedDate) return null;
  const path = (o.fullParentPathName ?? "").split(".").map((s) => s.trim()).filter(Boolean);
  const amount = o.award?.amount === null || o.award?.amount === undefined ? NaN : Number(String(o.award.amount).replace(/[$,]/g, ""));
  return {
    noticeId: o.noticeId,
    title: o.title.trim(),
    solicitationNumber: o.solicitationNumber || null,
    postedDate: o.postedDate.slice(0, 10),
    awardDate: o.award?.date?.slice(0, 10) || null,
    awardNumber: o.award?.number || null,
    amount: Number.isFinite(amount) ? amount : null,
    awardeeName: o.award?.awardee?.name?.trim() || null,
    awardeeUei: o.award?.awardee?.ueiSAM?.trim().toUpperCase() || null,
    department: path[0] ?? null,
    office: path.length > 1 ? path[path.length - 1] : null,
    naicsCode: o.naicsCode || null,
    url: o.uiLink || `https://sam.gov/opp/${encodeURIComponent(o.noticeId)}/view`,
  };
}

export async function fetchAwardNotices(apiKey: string, fromIso: string, toIso: string, offset: number) {
  const p = new URLSearchParams({
    api_key: apiKey,
    ptype: "a",
    postedFrom: samDate(fromIso),
    postedTo: samDate(toIso),
    limit: String(dataConfig.samOpportunities.pageSize),
    offset: String(offset),
  });
  return getJson<{ totalRecords: number; opportunitiesData?: SamOpportunity[] }>(`${dataConfig.samOpportunities.apiBase}?${p}`);
}
