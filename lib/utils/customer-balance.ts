/** Cashier-facing customer money position. */
export type CustomerBalanceView = {
  /** Amount customer owes the shop (AR). */
  owesUs: number;
  /** Prepaid held for the customer. */
  weHold: number;
  /** Positive = shop holds net; negative = customer owes net. */
  net: number;
  /** @deprecated use owesUs */
  netDue: number;
  /** @deprecated use weHold */
  depositHeld: number;
};

/**
 * Always surface both AR and deposit — cashiers need both, not a single
 * hidden field when both exist.
 */
export function customerBalanceView(
  outstanding: number,
  deposit: number
): CustomerBalanceView {
  const owesUs = Math.max(0, outstanding);
  const weHold = Math.max(0, deposit);
  return {
    owesUs,
    weHold,
    net: weHold - owesUs,
    netDue: owesUs,
    depositHeld: weHold,
  };
}
