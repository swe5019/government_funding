import { describe, expect, it } from "vitest";
import { categorize, fileKindFromName, parseRow, RowError, toDate, toMoney } from "@/lib/sources/usaspending/rows";

const contractRow = {
  contract_transaction_unique_key: "TX1",
  contract_award_unique_key: "CONT_AWD_X",
  award_id_piid: "X",
  modification_number: "P00001",
  federal_action_obligation: "-1500.25",
  total_dollars_obligated: "98500.00",
  action_date: "2026-05-03",
  awarding_agency_code: "097",
  awarding_agency_name: "Department of Defense",
  awarding_sub_agency_code: "1700",
  awarding_sub_agency_name: "Department of the Navy",
  funding_agency_code: "097",
  funding_agency_name: "",
  recipient_uei: "abc123",
  recipient_name: "Acme Corp",
  award_type_code: "D",
  disaster_emergency_fund_codes_for_overall_award: "Z: Infrastructure Investment and Jobs Act; Q: Excluded from tracking",
  last_modified_date: "2026-05-05 10:00:00",
};

describe("parseRow (contracts)", () => {
  const p = parseRow("contracts", contractRow);

  it("maps keys, money and dates", () => {
    expect(p.transaction).toMatchObject({ id: "TX1", awardId: "CONT_AWD_X", obligation: "-1500.25", actionDate: "2026-05-03", lastModifiedDate: "2026-05-05" });
    expect(p.award).toMatchObject({ totalObligated: "98500.00", category: "CONTRACT", displayId: "X" });
  });

  it("builds a source link when the permalink is missing", () => {
    expect(p.award.sourceUrl).toBe("https://www.usaspending.gov/award/CONT_AWD_X");
  });

  it("only references agencies it can create", () => {
    expect(p.award.awardingAgencyCode).toBe("097");
    expect(p.award.awardingSubCode).toBe("1700");
    expect(p.award.fundingAgencyCode).toBeNull(); // name blank
    expect(p.subAgencies).toEqual([{ code: "1700", name: "Department of the Navy", agencyCode: "097" }]);
  });

  it("parses DEF codes and upper-cases the UEI", () => {
    expect(p.award.defCodes).toEqual(["Z", "Q"]);
    expect(p.recipient.id).toBe("ABC123");
    expect(p.recipient.recipientType).toBe("BUSINESS");
  });

  it("rejects rows without a transaction key", () => {
    expect(() => parseRow("contracts", { ...contractRow, contract_transaction_unique_key: "" })).toThrow(RowError);
  });
});

describe("parseRow (assistance)", () => {
  it("classifies recipients from business type descriptions", () => {
    const base = {
      assistance_transaction_unique_key: "T",
      assistance_award_unique_key: "A",
      action_date: "2026-01-01",
      recipient_name: "Somebody",
      assistance_type_code: "04",
    };
    const t = (d: string) => parseRow("assistance", { ...base, business_types_description: d }).recipient.recipientType;
    expect(t("For-Profit Organization (Other than Small Business)")).toBe("BUSINESS");
    expect(t("Public/State Controlled Institution of Higher Education")).toBe("HIGHER_ED");
    expect(t("Nonprofit with 501C3 IRS Status (Other than an Institution of Higher Education)")).toBe("NONPROFIT");
    expect(t("State Government")).toBe("GOVERNMENT");
    expect(t("Individual/Family")).toBe("INDIVIDUAL");
  });

  it("accepts the legacy cfda_number column", () => {
    const p = parseRow("assistance", {
      assistance_transaction_unique_key: "T",
      assistance_award_unique_key: "A",
      action_date: "2026-01-01",
      recipient_name: "X",
      cfda_number: "11.037",
    });
    expect(p.award.assistanceListing).toBe("11.037");
  });
});

describe("helpers", () => {
  it("toDate", () => {
    expect(toDate("2024-03-05T12:00:00Z")).toBe("2024-03-05");
    expect(toDate("03/05/2024")).toBeNull();
  });
  it("toMoney", () => {
    expect(toMoney("$1,250.50")).toBe("1250.50");
    expect(toMoney("abc")).toBeNull();
  });
  it("categorize", () => {
    expect(categorize("contracts", "IDV_B")).toBe("IDV");
    expect(categorize("assistance", "07")).toBe("LOAN");
    expect(categorize("assistance", "10")).toBe("DIRECT_PAYMENT");
  });
  it("fileKindFromName", () => {
    expect(fileKindFromName("FY2026_All_Contracts_PrimeTransactions_2026-10-01_1.csv")).toBe("contracts");
    expect(fileKindFromName("All_Assistance_PrimeTransactions_1.csv")).toBe("assistance");
    expect(fileKindFromName("Data_Dictionary_Crosswalk.xlsx")).toBeNull();
  });
});
