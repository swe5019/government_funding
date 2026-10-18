import type { Metadata } from "next";
import { DISCLAIMER, siteConfig } from "@/config/site";

export const metadata: Metadata = { title: "Disclaimer" };

export default function DisclaimerPage() {
  return (
    <article className="prose-sm mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Disclaimer</h1>
      <p>{DISCLAIMER}</p>
      <p>
        {siteConfig.name} republishes public data from U.S. government sources such as USAspending.gov. Government data is
        frequently revised; amounts can be negative (de-obligations) and records can be corrected or removed after
        publication. Links between award recipients (legal entities) and publicly traded companies are produced by an
        automated matching process with a confidence score and may be wrong. Matches below our confidence threshold are
        labeled &ldquo;possible match&rdquo;.
      </p>
      <p>Nothing on this site is a recommendation to buy, sell or hold any security.</p>
    </article>
  );
}
