export function SearchForm({ defaultValue = "", autoFocus = false }: { defaultValue?: string; autoFocus?: boolean }) {
  return (
    <form action="/search" method="get" role="search" className="flex w-full gap-2">
      <label htmlFor="q" className="sr-only">
        Search by company, recipient, agency or ticker
      </label>
      <input
        id="q"
        name="q"
        type="search"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder="Company, recipient, agency or ticker (e.g. Lockheed, NASA)"
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
        Search
      </button>
    </form>
  );
}
