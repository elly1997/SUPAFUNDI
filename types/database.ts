/**
 * Minimal typed subset for app queries. Regenerate full types with:
 * npm run gen:types
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          address: string | null;
          phone: string | null;
          email: string | null;
          tax_id: string | null;
          currency: string;
          country: string;
          logo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          tax_id?: string | null;
          currency?: string;
          country?: string;
          logo_url?: string | null;
        };
        Update: {
          name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          tax_id?: string | null;
          currency?: string;
          country?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string | null;
          outlet_id: string | null;
          full_name: string | null;
          phone: string | null;
          email: string | null;
          role: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id?: string | null;
          outlet_id?: string | null;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          role: string;
          is_active?: boolean;
        };
        Update: {
          organization_id?: string | null;
          outlet_id?: string | null;
          full_name?: string | null;
          phone?: string | null;
          email?: string | null;
          role?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          parent_id?: string | null;
        };
        Update: {
          name?: string;
          parent_id?: string | null;
        };
        Relationships: [];
      };
      outlets: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string | null;
          address: string | null;
          phone: string | null;
          is_active: boolean;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code?: string | null;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          is_default?: boolean;
        };
        Update: {
          name?: string;
          code?: string | null;
          address?: string | null;
          phone?: string | null;
          is_default?: boolean;
          is_active?: boolean;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          value: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          key: string;
          value?: string | null;
        };
        Update: {
          value?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          category_id: string | null;
          supplier_id: string | null;
          code: string | null;
          barcode: string | null;
          name: string;
          description: string | null;
          unit: string;
          reorder_point: number;
          image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          category_id?: string | null;
          supplier_id?: string | null;
          code?: string | null;
          barcode?: string | null;
          name: string;
          description?: string | null;
          unit?: string;
          reorder_point?: number;
          image_url?: string | null;
          is_active?: boolean;
        };
        Update: {
          category_id?: string | null;
          supplier_id?: string | null;
          code?: string | null;
          barcode?: string | null;
          name?: string;
          description?: string | null;
          unit?: string;
          reorder_point?: number;
          image_url?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      product_prices: {
        Row: {
          id: string;
          product_id: string;
          price_type: string;
          price: number;
          min_qty: number;
          effective_from: string;
          effective_to: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          price_type: string;
          price: number;
          min_qty?: number;
          effective_from?: string;
          effective_to?: string | null;
        };
        Update: {
          price?: number;
          min_qty?: number;
          effective_to?: string | null;
        };
        Relationships: [];
      };
      stock: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string;
          product_id: string;
          quantity: number;
          cost_price: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id: string;
          product_id: string;
          quantity?: number;
          cost_price?: number;
        };
        Update: {
          quantity?: number;
          cost_price?: number;
        };
        Relationships: [];
      };
      chart_of_accounts: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          account_type: string;
          account_subtype: string | null;
          parent_id: string | null;
          is_system: boolean;
          is_active: boolean;
          normal_balance: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          name: string;
          account_type: string;
          account_subtype?: string | null;
          parent_id?: string | null;
          is_system?: boolean;
          is_active?: boolean;
          normal_balance: string;
          description?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      fiscal_periods: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          period_start: string;
          period_end: string;
          status: string;
          closed_at: string | null;
          closed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          period_start: string;
          period_end: string;
          status?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      tax_codes: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          name: string;
          rate: number;
          is_active: boolean;
          applies_to: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          code: string;
          name: string;
          rate?: number;
          is_active?: boolean;
          applies_to?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string | null;
          entry_no: string;
          entry_date: string;
          description: string;
          source_type: string;
          source_id: string | null;
          fiscal_period_id: string | null;
          is_posted: boolean;
          is_reversal: boolean;
          reversed_entry_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id?: string | null;
          entry_no: string;
          entry_date?: string;
          description: string;
          source_type: string;
          source_id?: string | null;
          fiscal_period_id?: string | null;
          is_posted?: boolean;
          created_by?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      journal_entry_lines: {
        Row: {
          id: string;
          journal_entry_id: string;
          account_id: string;
          debit: number;
          credit: number;
          memo: string | null;
        };
        Insert: {
          id?: string;
          journal_entry_id: string;
          account_id: string;
          debit?: number;
          credit?: number;
          memo?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          customer_type: string;
          credit_limit: number;
          credit_days: number;
          outstanding_balance: number;
          deposit_balance: number;
          price_type: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          customer_type?: string;
          credit_limit?: number;
          credit_days?: number;
          outstanding_balance?: number;
          deposit_balance?: number;
          price_type?: string;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          customer_type?: string;
          credit_limit?: number;
          credit_days?: number;
          price_type?: string;
          outstanding_balance?: number;
          deposit_balance?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string | null;
          invoice_no: string;
          sale_type: string;
          status: string;
          customer_id: string | null;
          subtotal: number;
          discount_amount: number;
          tax_rate: number;
          tax_amount: number;
          total_amount: number;
          amount_paid: number;
          deposit_applied: number;
          change_given: number;
          balance_due: number;
          notes: string | null;
          cashier_id: string | null;
          sale_date: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id?: string | null;
          invoice_no: string;
          sale_type?: string;
          status?: string;
          customer_id?: string | null;
          subtotal: number;
          discount_amount?: number;
          tax_rate?: number;
          tax_amount?: number;
          total_amount: number;
          amount_paid?: number;
          deposit_applied?: number;
          change_given?: number;
          balance_due?: number;
          notes?: string | null;
          cashier_id?: string | null;
          sale_date?: string;
        };
        Update: {
          status?: string;
          notes?: string | null;
          deposit_applied?: number;
        };
        Relationships: [];
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          discount_pct: number;
          tax_rate: number;
          total_price: number;
          sell_unit: string | null;
          sell_qty: number | null;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id?: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          discount_pct?: number;
          tax_rate?: number;
          total_price: number;
          sell_unit?: string | null;
          sell_qty?: number | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string | null;
          sale_id: string | null;
          payment_method: string;
          amount: number;
          status: string;
          reference_no: string | null;
          received_by: string | null;
          payment_account_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id?: string | null;
          sale_id?: string | null;
          payment_method: string;
          amount: number;
          status?: string;
          reference_no?: string | null;
          received_by?: string | null;
          payment_date?: string;
          payment_account_id?: string | null;
        };
        Update: {
          status?: string;
          reference_no?: string | null;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string | null;
          product_id: string | null;
          movement_type: string;
          quantity: number;
          unit_cost: number | null;
          reference_id: string | null;
          reference_type: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id?: string | null;
          product_id?: string | null;
          movement_type: string;
          quantity: number;
          unit_cost?: number | null;
          reference_id?: string | null;
          reference_type?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          is_active?: boolean;
        };
        Update: { is_active?: boolean; name?: string };
        Relationships: [];
      };
      grns: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string | null;
          supplier_id: string | null;
          po_id: string | null;
          received_date: string;
          payment_method: string;
          subtotal: number;
          tax_amount: number;
          total_amount: number;
          reference_no: string | null;
          invoice_no: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id?: string | null;
          supplier_id?: string | null;
          po_id?: string | null;
          received_date?: string;
          payment_method?: string;
          subtotal?: number;
          tax_amount?: number;
          total_amount?: number;
          reference_no?: string | null;
          invoice_no?: string | null;
          notes?: string | null;
          received_by?: string | null;
        };
        Update: {
          payment_method?: string;
          received_date?: string;
        };
        Relationships: [];
      };
      supplier_returns: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string;
          supplier_id: string | null;
          grn_id: string | null;
          reference_no: string | null;
          return_date: string;
          total_amount: number;
          payment_method: string;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id: string;
          supplier_id?: string | null;
          grn_id?: string | null;
          reference_no?: string | null;
          return_date?: string;
          total_amount?: number;
          payment_method?: string;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      supplier_return_items: {
        Row: {
          id: string;
          return_id: string;
          product_id: string;
          quantity: number;
          unit_cost: number;
          total_cost: number;
        };
        Insert: {
          id?: string;
          return_id: string;
          product_id: string;
          quantity: number;
          unit_cost: number;
          total_cost: number;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      purchase_orders: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string | null;
          supplier_id: string | null;
          reference_no: string | null;
          status: string;
          order_date: string;
          expected_date: string | null;
          subtotal: number;
          tax_amount: number;
          total_amount: number;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id?: string | null;
          supplier_id?: string | null;
          reference_no?: string | null;
          status?: string;
          order_date?: string;
          expected_date?: string | null;
          subtotal?: number;
          tax_amount?: number;
          total_amount?: number;
          notes?: string | null;
          created_by?: string | null;
        };
        Update: {
          status?: string;
        };
        Relationships: [];
      };
      purchase_order_items: {
        Row: {
          id: string;
          po_id: string;
          product_id: string | null;
          ordered_qty: number;
          received_qty: number;
          unit_cost: number;
          total_cost: number | null;
        };
        Insert: {
          id?: string;
          po_id: string;
          product_id?: string | null;
          ordered_qty: number;
          received_qty?: number;
          unit_cost: number;
          total_cost?: number | null;
        };
        Update: {
          received_qty?: number;
        };
        Relationships: [];
      };
      stock_transfers: {
        Row: {
          id: string;
          organization_id: string;
          from_outlet_id: string | null;
          to_outlet_id: string | null;
          status: string;
          reference_no: string | null;
          notes: string | null;
          created_at: string;
          dispatched_at: string | null;
          received_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          from_outlet_id?: string | null;
          to_outlet_id?: string | null;
          status?: string;
          reference_no?: string | null;
          notes?: string | null;
          requested_by?: string | null;
        };
        Update: {
          status?: string;
          approved_by?: string | null;
          dispatched_at?: string | null;
          received_at?: string | null;
          received_by?: string | null;
        };
        Relationships: [];
      };
      stock_transfer_items: {
        Row: {
          id: string;
          transfer_id: string;
          product_id: string | null;
          requested_qty: number;
          dispatched_qty: number | null;
          received_qty: number | null;
          unit_cost: number | null;
        };
        Insert: {
          id?: string;
          transfer_id: string;
          product_id?: string | null;
          requested_qty: number;
        };
        Update: {
          dispatched_qty?: number;
          received_qty?: number;
          unit_cost?: number | null;
        };
        Relationships: [];
      };
      grn_items: {
        Row: {
          id: string;
          grn_id: string;
          product_id: string | null;
          quantity: number;
          unit_cost: number;
          total_cost: number | null;
        };
        Insert: {
          id?: string;
          grn_id: string;
          product_id?: string | null;
          quantity: number;
          unit_cost: number;
          total_cost?: number | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string | null;
          category: string | null;
          description: string | null;
          amount: number;
          expense_date: string;
          payment_method: string | null;
          reference_no: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id?: string | null;
          category?: string | null;
          description?: string | null;
          amount: number;
          payment_method?: string | null;
          reference_no?: string | null;
          expense_date?: string;
          created_by?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      daily_closings: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string;
          business_date: string;
          opening_balance: number;
          closing_balance: number | null;
          expected_cash: number | null;
          cash_sales: number;
          cash_expenses: number;
          mpesa_sales: number;
          bank_deposits: number;
          variance: number | null;
          status: string;
          reconciled_at: string | null;
          reconciled_by: string | null;
          notes: string | null;
          report_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id: string;
          business_date: string;
          opening_balance?: number;
          closing_balance?: number | null;
          expected_cash?: number | null;
          cash_sales?: number;
          cash_expenses?: number;
          mpesa_sales?: number;
          bank_deposits?: number;
          variance?: number | null;
          status?: string;
          reconciled_at?: string | null;
          reconciled_by?: string | null;
          notes?: string | null;
          report_sent_at?: string | null;
        };
        Update: {
          opening_balance?: number;
          closing_balance?: number | null;
          expected_cash?: number | null;
          cash_sales?: number;
          cash_expenses?: number;
          mpesa_sales?: number;
          bank_deposits?: number;
          variance?: number | null;
          status?: string;
          reconciled_at?: string | null;
          reconciled_by?: string | null;
          notes?: string | null;
          report_sent_at?: string | null;
        };
        Relationships: [];
      };
      cash_sessions: {
        Row: {
          id: string;
          organization_id: string;
          outlet_id: string | null;
          opening_balance: number;
          closing_balance: number | null;
          expected_balance: number | null;
          variance: number | null;
          status: string;
          opened_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          outlet_id?: string | null;
          cashier_id?: string | null;
          opening_balance: number;
          status?: string;
          notes?: string | null;
        };
        Update: {
          closing_balance?: number;
          expected_balance?: number;
          variance?: number;
          status?: string;
          closed_at?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          organization_id: string;
          customer_id: string | null;
          entry_type: string;
          reference_id: string | null;
          reference_type: string | null;
          debit: number;
          credit: number;
          balance: number;
          description: string | null;
          due_date: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_id?: string | null;
          entry_type: string;
          reference_id?: string | null;
          reference_type?: string | null;
          debit?: number;
          credit?: number;
          balance: number;
          description?: string | null;
          due_date?: string | null;
          created_by?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      seed_default_org_settings: {
        Args: { p_org_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
