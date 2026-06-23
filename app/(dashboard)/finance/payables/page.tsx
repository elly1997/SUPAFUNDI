import { redirect } from "next/navigation";

export default function PayablesRedirectPage() {
  redirect("/suppliers?tab=bills");
}
