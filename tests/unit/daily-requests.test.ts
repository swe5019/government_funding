import { describe, expect, it } from "vitest";
import { dataConfig } from "@/config/data";
import { dailyRequests } from "@/jobs/usaspending";

describe("dailyRequests", () => {
  const today = new Date("2026-11-02T15:00:00Z");

  it("contracts by last-modified since the last load, assistance by action date over the lookback", () => {
    const [contracts, assistance] = dailyRequests(new Date("2026-10-30T00:00:00Z"), today);
    expect(contracts).toEqual({ kind: "contracts", dateType: "last_modified_date", startDate: "2026-10-27", endDate: "2026-11-02" });
    expect(assistance).toEqual({ kind: "assistance", dateType: "action_date", startDate: "2026-09-18", endDate: "2026-11-02" });
    expect(dataConfig.assistanceDailyLookbackDays).toBe(45);
  });

  it("starts from today minus the overlap when nothing was loaded yet", () => {
    expect(dailyRequests(null, today)[0].startDate).toBe("2026-10-30");
  });
});
