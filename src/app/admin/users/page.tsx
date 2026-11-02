import { Suspense } from "react";
import { formatDate } from "@/lib/format";
import { requireAdmin } from "@/lib/admin/require-admin";
import { getUserSummary, listUsers, type AdminUserRow } from "@/lib/admin/users";

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-md bg-line" aria-busy="true" />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

function plan(u: AdminUserRow): string {
  if (!u.subscriptionStatus) return "Free";
  if (u.subscriptionStatus === "trialing") return `Trial (ends ${u.trialEndsAt ? formatDate(u.trialEndsAt) : "?"})`;
  const label = { active: "Pro", past_due: "Pro: payment failed", canceled: "Cancelled" }[u.subscriptionStatus] ?? u.subscriptionStatus;
  const interval = u.interval === "year" ? "yearly" : u.interval === "month" ? "monthly" : "";
  return [label, interval, u.cancelAtPeriodEnd ? "cancels at period end" : ""].filter(Boolean).join(" · ");
}

async function Users({ searchParams }: { searchParams: PageProps<"/admin/users">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const [summary, users] = await Promise.all([getUserSummary(), listUsers({ q })]);
  const tiles: [string, number][] = [
    ["Users", summary.total],
    ["New, 7 days", summary.last7Days],
    ["New, 30 days", summary.last30Days],
    ["Pro (paying)", summary.active],
    ["On trial", summary.trialing],
    ["Payment failed", summary.pastDue],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Users</h1>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="User totals">
        {tiles.map(([label, n]) => (
          <div key={label} className="rounded-md border border-line bg-surface p-3">
            <div className="text-xs text-muted">{label}</div>
            <div className="tabular text-xl font-semibold">{n.toLocaleString()}</div>
          </div>
        ))}
      </section>

      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by email"
          aria-label="Search users by email"
          className="w-64 rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
        />
        <button className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-bg">Search</button>
      </form>

      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Signed up</th>
              <th className="px-3 py-2 font-medium">Last active (approx.)</th>
              <th className="px-3 py-2 text-right font-medium">Watched companies</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">
                  {u.email}
                  {u.role === "ADMIN" && <span className="ml-2 rounded bg-warn-bg px-1.5 text-xs text-warn-fg">admin</span>}
                  {!u.acceptedDisclaimerAt && <span className="ml-2 text-xs text-muted">(disclaimer pending)</span>}
                </td>
                <td className="px-3 py-2">{plan(u)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(u.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{u.lastActiveAt ? formatDate(u.lastActiveAt) : "—"}</td>
                <td className="tabular px-3 py-2 text-right">{u.watchlistItems}</td>
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted">No users{q ? ` matching “${q}”` : " yet"}.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">Showing the 200 most recent sign-ups{q ? " matching your search" : ""}.</p>
    </div>
  );
}
