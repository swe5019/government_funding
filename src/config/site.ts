/** Single place to rename the product. */
export const siteConfig = {
  name: "FedFlow",
  tagline: "Follow federal money to public companies.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supportEmail: "support@example.com",
} as const;

export const DISCLAIMER =
  "Informational only. Not investment advice. Award data comes from public U.S. government sources and may be incomplete, delayed or revised; links between government award recipients and public companies are estimates. Do your own research or consult a licensed professional before making investment decisions.";
