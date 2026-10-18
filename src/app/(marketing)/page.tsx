import { SearchForm } from "@/components/search-form";
import { siteConfig } from "@/config/site";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-12 text-center">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{siteConfig.tagline}</h1>
      <p className="text-muted">
        See which companies receive federal contracts, grants and program money — straight from official government
        records, with a link to the source for every award.
      </p>
      <SearchForm />
      <p className="text-xs text-muted">Informational only. Not investment advice.</p>
    </div>
  );
}
