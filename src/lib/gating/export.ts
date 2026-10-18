import { dataWindow, type DataWindow } from "./dataCutoff";
import { getViewer, type Viewer } from "./viewer";

/** Gate for CSV routes: JSON error responses instead of redirects (these are downloads). */
export async function exportViewer(): Promise<{ viewer: Viewer; win: DataWindow } | Response> {
  const viewer = await getViewer();
  if (!viewer.user) return Response.json({ error: "Sign in to export data." }, { status: 401 });
  if (!viewer.entitlements.csvExport) return Response.json({ error: "CSV export is a Pro feature." }, { status: 403 });
  return { viewer, win: dataWindow(viewer.entitlements) };
}

export const today = () => new Date().toISOString().slice(0, 10);
