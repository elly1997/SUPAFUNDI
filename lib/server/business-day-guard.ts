import { requireOrgContext } from "@/lib/server/org-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Block cash-affecting mutations on days already reconciled for an outlet. */
export async function checkBusinessDayMutable(
  outletId: string | null | undefined,
  businessDate: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!outletId) {
    return {
      ok: false,
      message: "Select an outlet before recording activity for this business date.",
    };
  }

  const ctx = await requireOrgContext();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("daily_closings")
    .select("id")
    .eq("organization_id", ctx.organizationId)
    .eq("outlet_id", outletId)
    .eq("business_date", businessDate)
    .eq("status", "reconciled")
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }
  if (data) {
    return {
      ok: false,
      message: `${businessDate} is already reconciled for this outlet. Change the business date in the header to continue.`,
    };
  }
  return { ok: true };
}
