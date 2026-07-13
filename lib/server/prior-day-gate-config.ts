/** Prior-day close → reconcile → director send starts on this EAT date. */
export const PRIOR_DAY_GATE_EFFECTIVE_FROM = "2026-07-13";

export type PriorDayBlocker = {
  businessDate: string;
  reason: "open_session" | "unreconciled" | "report_not_sent";
  message: string;
  catchUpHref: string;
};
