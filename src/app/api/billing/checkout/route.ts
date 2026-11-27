import { getSubscription, syncSubscription } from "@/lib/billing";
import { isPromptsLookup, isTasksLookup, isAddonLookup, lookupKey, MIXES, PROMPT_STEP, promptsLookupKey, SELF_SERVE, TASK_STEP, tasksLookupKey, type Extras, type Interval, type Mix, type PlanId } from "@/lib/plans";
import { adminClient, requireRole } from "@/lib/serverAuth";
import { originOf, priceFor, stripe, stripeReady, type Subscription } from "@/lib/stripe";
import { errorResponse } from "@/lib/errorsServer";

// Pick or change a plan. With no subscription yet, this opens Stripe Checkout.
// With one, it switches the plan at once and charges or credits the difference.
//   { workspaceId, plan, interval, mix?: "both" | "visibility" | "seo", tasks?: extra 1,000-task steps, prompts?: extra 25-prompt steps }
// Without mix, tasks or prompts, the workspace keeps what it has (a v5 Starter's toolset pick moves to both).
// SEO Research only tracks no prompts, so it never carries prompt steps.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const auth = await requireRole(request, body.workspaceId, "admin");
  if ("denied" in auth) return auth.denied;
  if (!stripeReady()) return Response.json({ error: "STRIPE_SECRET_KEY is not set on the server." }, { status: 500 });
  const db = adminClient();
  if (!db) return Response.json({ error: "Add SUPABASE_SECRET_KEY to the server's settings." }, { status: 500 });
  const plan = body.plan as PlanId;
  const interval: Interval = body.interval === "year" ? "year" : "month";
  if (!SELF_SERVE.includes(plan)) return Response.json({ error: "Pick Starter, Pro or Agency." }, { status: 400 });
  if (body.mix !== undefined && !MIXES.includes(body.mix)) return Response.json({ error: "Pick AI Visibility, SEO Research or both." }, { status: 400 });
  if (body.tasks !== undefined && !(Number.isInteger(body.tasks) && body.tasks >= 0 && body.tasks <= TASK_STEP.max)) return Response.json({ error: `Extra tasks go from 0 to ${TASK_STEP.max} steps.` }, { status: 400 });
  if (body.prompts !== undefined && !(Number.isInteger(body.prompts) && body.prompts >= 0 && body.prompts <= PROMPT_STEP.max)) return Response.json({ error: `Extra prompts go from 0 to ${PROMPT_STEP.max} steps.` }, { status: 400 });

  const { data: ws, error } = await db.from("workspaces").select("id, name, plan_status, stripe_customer_id, stripe_subscription_id, extras").eq("id", body.workspaceId).maybeSingle();
  if (error || !ws) return errorResponse(error ?? new Error("Workspace not found."), "api/billing/checkout");
  const extras = (ws.extras ?? {}) as Extras;
  // A v5 Starter's toolset pick was free to switch; a v7 one-toolset plan was paid for, so only that one carries over.
  const mix: Mix = (body.mix as Mix | undefined) ?? (extras.limitsFrom === "v5" ? "both" : (extras.track ?? "both"));
  const steps: number = body.tasks ?? Math.max(0, Math.floor(extras.tasks ?? 0));
  // Prompt steps carry over only from a v8 plan (an older price's extras.prompts were set by hand, not bought here).
  const promptSteps: number = mix === "seo" ? 0 : (body.prompts ?? (extras.limitsFrom ? 0 : Math.max(0, Math.floor((extras.prompts ?? 0) / PROMPT_STEP.prompts))));

  try {
    const price = await priceFor(lookupKey(plan, interval, mix));
    const tasksPrice = steps > 0 ? await priceFor(tasksLookupKey(interval)) : null;
    const promptsPrice = promptSteps > 0 ? await priceFor(promptsLookupKey(interval)) : null;
    const origin = originOf(request);

    // Already paying: swap the prices on the live subscription.
    if (ws.stripe_subscription_id) {
      const sub = await getSubscription(ws.stripe_subscription_id).catch(() => null);
      if (sub && !["canceled", "incomplete_expired"].includes(sub.status)) {
        const item = sub.items.data.find((i) => !isAddonLookup(i.price.lookup_key)) ?? sub.items.data[0];
        const items: Record<string, unknown>[] = [{ id: item.id, price: price.id }];
        // Each add-on item is changed, removed or added to match the card.
        const addon = (have: { id: string } | undefined, want: { id: string } | null, quantity: number) => {
          if (have && want) items.push({ id: have.id, price: want.id, quantity });
          else if (have) items.push({ id: have.id, deleted: true });
          else if (want) items.push({ price: want.id, quantity });
        };
        addon(sub.items.data.find((i) => isTasksLookup(i.price.lookup_key)), tasksPrice, steps);
        addon(sub.items.data.find((i) => isPromptsLookup(i.price.lookup_key)), promptsPrice, promptSteps);
        // A downgrade scheduled from the billing portal would switch the plan back at the end of the period. Picking a plan here replaces it.
        const schedule = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
        if (schedule) await stripe("POST", `subscription_schedules/${schedule}/release`);
        const updated = await stripe<Subscription>("POST", `subscriptions/${sub.id}`, {
          items,
          proration_behavior: "always_invoice",
          cancel_at_period_end: false,
          metadata: { workspace_id: ws.id },
        });
        await syncSubscription(updated);
        return Response.json({ changed: true, plan, mix, tasks: steps, prompts: promptSteps });
      }
    }

    let customer = ws.stripe_customer_id as string | null;
    if (!customer) {
      const { data: user } = await auth.sb.auth.getUser();
      const made = await stripe<{ id: string }>("POST", "customers", { email: user.user?.email, name: ws.name, metadata: { workspace_id: ws.id } }, `customer-${ws.id}`);
      customer = made.id;
      await db.from("workspaces").update({ stripe_customer_id: customer }).eq("id", ws.id);
    }
    const session = await stripe<{ url: string }>("POST", "checkout/sessions", {
      mode: "subscription",
      customer,
      client_reference_id: ws.id,
      line_items: [{ price: price.id, quantity: 1 }, ...(tasksPrice ? [{ price: tasksPrice.id, quantity: steps }] : []), ...(promptsPrice ? [{ price: promptsPrice.id, quantity: promptSteps }] : [])],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      subscription_data: { metadata: { workspace_id: ws.id } },
      metadata: { workspace_id: ws.id },
      success_url: `${origin}/billing?checkout=done`,
      cancel_url: `${origin}/billing`,
    });
    return Response.json({ url: session.url });
  } catch (e) {
    return errorResponse(e, "api/billing/checkout");
  }
}
