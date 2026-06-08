/** Primary balance line for customers (AR or deposit — not both after server netting). */
export type CustomerBalanceView = {
  netDue: number;
  depositHeld: number;
};

export function customerBalanceView(
  outstanding: number,
  deposit: number
): CustomerBalanceView {
  const due = Math.max(0, outstanding);
  const dep = Math.max(0, deposit);
  if (due > 0) return { netDue: due, depositHeld: 0 };
  if (dep > 0) return { netDue: 0, depositHeld: dep };
  return { netDue: 0, depositHeld: 0 };
}
