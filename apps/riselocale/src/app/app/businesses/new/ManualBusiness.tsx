"use client";

import { useActionState } from "react";
import { addBusinessByHand, type FormState } from "@/app/actions";

export default function ManualBusiness() {
  const [state, action, pending] = useActionState<FormState, FormData>(addBusinessByHand, null);
  return (
    <form className="form" action={action} style={{ maxWidth: 520 }}>
      <div className="rl-field">
        <label htmlFor="m-name">Name, exactly as on Google</label>
        <input id="m-name" name="name" className="rl-input" required />
      </div>
      <div className="rl-field">
        <label htmlFor="m-domain">Website</label>
        <input id="m-domain" name="domain" className="rl-input" placeholder="joespizza.com" />
      </div>
      <div className="rl-field">
        <label htmlFor="m-address">Address</label>
        <input id="m-address" name="address" className="rl-input" />
      </div>
      <div className="row">
        <div className="rl-field">
          <label htmlFor="m-lat">Latitude</label>
          <input id="m-lat" name="lat" className="rl-input" inputMode="decimal" required />
        </div>
        <div className="rl-field">
          <label htmlFor="m-lng">Longitude</label>
          <input id="m-lng" name="lng" className="rl-input" inputMode="decimal" required />
        </div>
      </div>
      <p className="hint">Without a Google listing ID, a result only matches when its name is the same and its website doesn&apos;t differ.</p>
      {state?.error && <p className="error">{state.error}</p>}
      <div>
        <button className="rl-btn rl-btn--primary" disabled={pending}>
          Add business
        </button>
      </div>
    </form>
  );
}
