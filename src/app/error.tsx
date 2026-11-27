"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { reloadOnce } from "@/lib/staleBuild";
import Link from "next/link";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function Error({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
    reloadOnce(error);
  }, [error]);
  return (
    <ErrorScreen
      code="Error"
      title="Something went wrong"
      actions={
        <>
          <button type="button" className="aw-btn aw-btn--primary" onClick={() => window.location.reload()}>
            Try again
          </button>
          <Link className="aw-btn aw-btn--secondary" href="/">
            Go home
          </Link>
        </>
      }
    >
      We&apos;ve been told about it. Try again, and if it keeps happening, email support@arrowsterr.com with the ref below.
      {error.digest ? <span className="mt-3 block text-[12px] text-muted tabular-nums">Ref {error.digest.slice(0, 10).toUpperCase()}</span> : null}
    </ErrorScreen>
  );
}
