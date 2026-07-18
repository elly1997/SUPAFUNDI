-- One-click reversal of mistaken deposits/withdrawals: original row is marked
-- reversed and a counter-entry links back via reversal_of.
alter table public.bank_transactions
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reversal_of uuid references public.bank_transactions (id) on delete set null;

create index if not exists idx_bank_transactions_reversal_of
  on public.bank_transactions (reversal_of)
  where reversal_of is not null;
