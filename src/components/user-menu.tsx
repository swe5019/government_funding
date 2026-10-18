import Link from "next/link";
import { getViewer } from "@/lib/gating/viewer";

/** Session-dependent header links. Rendered inside <Suspense> so the header shell stays static. */
export async function UserMenu() {
  const viewer = await getViewer();
  if (!viewer.user) {
    return (
      <>
        <Link href="/pricing" className="hover:text-fg">
          Pricing
        </Link>
        <Link href="/signin" className="rounded-md border border-line px-3 py-1 text-fg hover:bg-bg">
          Sign in
        </Link>
      </>
    );
  }
  return (
    <>
      {viewer.isAdmin && (
        <Link href="/admin/matches" className="hover:text-fg">
          Admin
        </Link>
      )}
      {viewer.plan === "free" && (
        <Link href="/pricing" className="font-medium text-accent hover:underline">
          Upgrade
        </Link>
      )}
      <Link href="/account" className="rounded-md border border-line px-3 py-1 text-fg hover:bg-bg">
        Account
      </Link>
    </>
  );
}
