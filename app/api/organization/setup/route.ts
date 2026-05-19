import { NextResponse } from "next/server";
import { runCompleteOrganizationSetup } from "@/lib/setup/complete-organization";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, message: "You must be signed in." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const result = await runCompleteOrganizationSetup(user, supabase, body);

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        message: e instanceof Error ? e.message : "Setup failed",
      },
      { status: 500 }
    );
  }
}
