import { NextResponse } from "next/server";
import { deleteEmployee, updateEmployee } from "@/lib/actions/employees";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const result = await updateEmployee(params.id, body);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    let reassignToEmployeeId: string | null = null;
    try {
      const body = (await request.json()) as {
        reassignToEmployeeId?: string | null;
      };
      reassignToEmployeeId = body.reassignToEmployeeId ?? null;
    } catch {
      /* empty body is fine */
    }
    const result = await deleteEmployee(params.id, { reassignToEmployeeId });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
