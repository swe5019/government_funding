import { dataConfig } from "@/config/data";
import { siteConfig } from "@/config/site";
import { createTextFetcher } from "@/lib/sources/http";

/** defense.gov pages: one request every 2s, identified as our app. */
const getText = createTextFetcher({
  minGapMs: 2_000,
  headers: { "user-agent": `${siteConfig.name} (+${siteConfig.url})`, accept: "text/html,application/xml" },
});

export const fetchContractsRss = () => getText(dataConfig.dod.rssUrl);
export const fetchContractsPage = (url: string) => getText(url);
