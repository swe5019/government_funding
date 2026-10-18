/** Accessible table view for a chart, collapsed by default. */
export function DataTableDetails({
  summary = "Show data table",
  headers,
  rows,
}: {
  summary?: string;
  headers: [string, string];
  rows: [string, string][];
}) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted">{summary}</summary>
      <table className="mt-2 w-full max-w-md">
        <thead className="text-left text-muted">
          <tr>
            <th className="py-1 font-medium">{headers[0]}</th>
            <th className="py-1 text-right font-medium">{headers[1]}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td className="py-1">{a}</td>
              <td className="tabular py-1 text-right">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
