import { NextResponse } from "next/server";
import { listPosPaymentAccounts } from "@/lib/actions/banking";
import { requireOrgContext } from "@/lib/server/org-context";
import { z } from "zod";

const methodSchema = z.enum(["mpesa", "bank_transfer", "card"]);

export async function GET(request: Request) {
  try {
    await requireOrgContext();
    const method = methodSchema.parse(
      new URL(request.url).searchParams.get("method") ?? "mpesa"
    );
    const accounts = await listPosPaymentAccounts(method);
    return NextResponse.json({ accounts });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load accounts";
    const status = message.includes("signed in") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
