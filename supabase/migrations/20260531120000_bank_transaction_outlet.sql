-- Link bank deposits from a specific outlet drawer (cash-to-bank transfers).
alter table public.bank_transactions
  add column if not exists outlet_id uuid references public.outlets (id) on delete set null;

create index if not exists idx_bank_txn_outlet_deposit_date
  on public.bank_transactions (organization_id, outlet_id, transaction_date)
  where transaction_type = 'deposit' and outlet_id is not null;
