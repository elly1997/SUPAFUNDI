-- Allow grn_void journal source for reversing GRN postings (voidGrn).
alter table public.journal_entries drop constraint if exists journal_entries_source_type_check;

alter table public.journal_entries add constraint journal_entries_source_type_check check (
  source_type in (
    'sale', 'sale_return', 'payment', 'grn', 'grn_void', 'expense',
    'supplier_bill', 'supplier_payment', 'supplier_return',
    'stock_adjustment', 'opening_balance', 'manual', 'transfer', 'payroll'
  )
);
