import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getCtx } from "@/lib/auth";

export default async function Signup() {
  if (await getCtx()) redirect("/app");
  return (
    <main className="auth">
      <div className="card">
        <Link href="/" className="wordmark">
          RiseLocale
        </Link>
        <h1 className="page-title">
          Create your account<span>{Number(process.env.RL_MONTHLY_CREDITS) || 10000} scan credits each month. 1 pin is 1 credit.</span>
        </h1>
        <AuthForm kind="signup" />
        <p className="small muted">
          Have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
