import SettingsForm from "@/components/SettingsForm";
import { requireCtx } from "@/lib/auth";

export default async function Settings() {
  const ctx = await requireCtx();
  const w = ctx.workspace;
  return (
    <div className="page">
      <h1 className="page-title">
        Settings<span>Shared reports show your name, logo and color instead of RiseLocale.</span>
      </h1>
      <div className="panel panel-body small" style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        <span>
          Credits <b className="mono">{w.credits.toLocaleString()}</b> of <span className="mono">{w.monthly_credits.toLocaleString()}</span>
        </span>
        <span className="muted">Resets {new Date(w.credits_reset_at).toLocaleDateString()}</span>
        <span className="muted">Signed in as {ctx.user.email}</span>
      </div>
      <SettingsForm values={w} canSave={["owner", "admin"].includes(w.role)} />
    </div>
  );
}
