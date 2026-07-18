/**
 * WhatsApp deep-link helpers. wa.me only accepts international-format numbers
 * (no leading 0, no +), otherwise the chat opens without the pre-filled text.
 */

/** Normalize a phone number to international digits (Tanzania default country code). */
export function normalizeWhatsAppPhone(
  raw: string | null | undefined
): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) {
    // Local format 07XX/06XX XXX XXX → 255XXXXXXXXX
    digits = `255${digits.slice(1)}`;
  } else if (
    digits.length === 9 &&
    (digits.startsWith("7") || digits.startsWith("6"))
  ) {
    digits = `255${digits}`;
  }
  return digits;
}

/** Build a wa.me URL that opens a chat with the message pre-typed. */
export function buildWhatsAppUrl(
  phone: string | null | undefined,
  message: string
): string {
  const digits = normalizeWhatsAppPhone(phone);
  const text = encodeURIComponent(message);
  return digits
    ? `https://wa.me/${digits}?text=${text}`
    : `https://wa.me/?text=${text}`;
}
