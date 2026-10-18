"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">
        The error has been reported. Try again, or come back in a few minutes.
        {error.digest && <span className="block pt-1 font-mono text-xs">Reference: {error.digest}</span>}
      </p>
      <button onClick={reset} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
        Try again
      </button>
    </div>
  );
}
