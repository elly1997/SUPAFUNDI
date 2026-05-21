-- Payment collection accounts (bank, M-Pesa, Lipa) for Banking + POS routing

alter table public.bank_accounts
  add column if not exists account_type text not null default 'bank';

alter table public.bank_accounts
  drop constraint if exists bank_accounts_account_type_check;

alter table public.bank_accounts
  add constraint bank_accounts_account_type_check check (
    account_type in ('bank', 'mpesa', 'lipa', 'till')
  );

alter table public.bank_accounts
  add column if not exists lipa_merchant text;

alter table public.bank_accounts
  add column if not exists pos_payment_method text check (
    pos_payment_method is null
    or pos_payment_method in ('mpesa', 'bank_transfer', 'card')
  );

alter table public.bank_accounts
  add column if not exists show_in_pos boolean not null default true;

comment on column public.bank_accounts.account_type is
  'bank = bank account; mpesa = M-Pesa wallet; lipa = Lipa number; till = paybill/till';

comment on column public.bank_accounts.pos_payment_method is
  'Which POS payment chip uses this account (mpesa / bank_transfer / card)';

alter table public.payments
  add column if not exists payment_account_id uuid references public.bank_accounts (id) on delete set null;

create index if not exists idx_payments_payment_account
  on public.payments (payment_account_id)
  where payment_account_id is not null;
