import Link from "next/link";
import { SearchForm } from "@/components/search-form";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted">That company, recipient or page doesn&rsquo;t exist (or isn&rsquo;t linked to federal awards yet).</p>
      <SearchForm />
      <Link href="/" className="inline-block text-sm text-accent hover:underline">
        Go to the home page
      </Link>
    </div>
  );
}
