import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

export default function CheckEmailPage() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="text-muted">We sent you a sign-in link. It expires in 15 minutes and works once.</p>
      <p className="text-xs text-muted">Nothing arrived? Check spam, or go back and request another link.</p>
    </div>
  );
}
