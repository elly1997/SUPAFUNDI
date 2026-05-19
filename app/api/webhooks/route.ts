import { jsonNotImplemented, methodNotAllowed } from "@/lib/http/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  return methodNotAllowed("POST");
}

export async function POST() {
  try {
    return jsonNotImplemented("Webhooks not implemented yet.", 501);
  } catch {
    return jsonNotImplemented("Unexpected error handling webhook.", 500);
  }
}
