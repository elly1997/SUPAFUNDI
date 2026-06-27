/** Normalize Tanzania mobile numbers to E.164 (+255…). */
export function normalizeTzPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let national = digits;
  if (national.startsWith("255")) {
    national = national.slice(3);
  }
  if (national.startsWith("0")) {
    national = national.slice(1);
  }

  // TZ mobile: 9 digits starting with 6 or 7
  if (!/^[67]\d{8}$/.test(national)) return null;
  return `+255${national}`;
}

export function formatPhoneDisplay(e164: string): string {
  if (e164.startsWith("+255") && e164.length === 13) {
    return `0${e164.slice(4)}`;
  }
  return e164;
}
