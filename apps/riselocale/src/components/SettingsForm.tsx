"use client";

import { useActionState } from "react";
import { saveSettings, type FormState } from "@/app/actions";

type Values = { name: string; report_name: string; report_logo_url: string; report_color: string; report_footer: string; alert_emails: boolean };

export default function SettingsForm({ values, canSave }: { values: Values; canSave: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettings, null);
  return (
    <form className="form" action={action} style={{ maxWidth: 520 }}>
      <div className="rl-field">
        <label htmlFor="name">Workspace name</label>
        <input id="name" name="name" className="rl-input" defaultValue={values.name} />
      </div>
      <div className="rl-field">
        <label htmlFor="report_name">Name on reports</label>
        <input id="report_name" name="report_name" className="rl-input" defaultValue={values.report_name} placeholder="Your agency" />
      </div>
      <div className="rl-field">
        <label htmlFor="report_logo_url">Logo link</label>
        <input id="report_logo_url" name="report_logo_url" className="rl-input" defaultValue={values.report_logo_url} placeholder="https://youragency.com/logo.png" />
      </div>
      <div className="rl-field">
        <label htmlFor="report_color">Accent color</label>
        <input id="report_color" name="report_color" className="rl-input" defaultValue={values.report_color} placeholder="#3358ff" />
      </div>
      <div className="rl-field">
        <label htmlFor="report_footer">Report footer</label>
        <input id="report_footer" name="report_footer" className="rl-input" defaultValue={values.report_footer} placeholder="Questions? Call us at (555) 010-2000" />
      </div>
      <label className="check">
        <input type="checkbox" name="alert_emails" defaultChecked={values.alert_emails} /> Email owners and admins when ranks drop
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="ok">{state.ok}</p>}
      <div>
        <button className="rl-btn rl-btn--primary" disabled={pending || !canSave}>
          Save
        </button>
      </div>
    </form>
  );
}
