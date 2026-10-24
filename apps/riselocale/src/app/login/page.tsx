import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCtx } from "@/lib/auth";

export default async function Login() {
  if (await getCtx()) redirect("/app");
  return (
    <main className="auth">
      <div className="card">
        <Link href="/" className="wordmark">
          RiseLocale
        </Link>
        <h1 className="page-title">Sign in</h1>
        <AuthForm kind="login" />
        <p className="small muted">
          New here? <Link href="/signup">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
