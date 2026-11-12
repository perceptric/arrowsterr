import Link from "next/link";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function NotFound() {
  return (
    <ErrorScreen
      code="404"
      title="This page isn't here"
      actions={
        <Link className="aw-btn aw-btn--primary" href="/">
          Go to Arrowsterr
        </Link>
      }
    >
      The link may be old.
    </ErrorScreen>
  );
}
