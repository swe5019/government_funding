/**
 * Minimal RFC 4180 CSV writer. Cells that a spreadsheet would treat as a formula (leading
 * = + - @ tab or CR) are prefixed with an apostrophe to prevent CSV injection; plain numbers,
 * including negative amounts, are left alone so they stay numeric.
 */
export type Cell = string | number | boolean | Date | null | undefined;

const NUMERIC = /^-?\d+(\.\d+)?$/;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, body: string): Response {
  return new Response("﻿" + body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "cache-control": "private, no-store",
    },
  });
}
