/** Link to the original government record. Every award shown must have one. */
export function SourceLink({ href, label = "USAspending" }: { href: string; label?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
      {label}
      <span aria-hidden> ↗</span>
      <span className="sr-only"> (opens original government record in a new tab)</span>
    </a>
  );
}
