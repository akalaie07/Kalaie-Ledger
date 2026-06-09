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
          slug: string;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["role_enum"];
          created_at: string;
          updated_at: string;
          last_seen_at: string | null;
        };
        Insert: {
          id: string;
          organization_id: string;
          email: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["role_enum"];
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["role_enum"];
          created_at?: string;
          updated_at?: string;
          last_seen_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_invites: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: Database["public"]["Enums"]["role_enum"];
          token: string;
          expires_at: string;
          accepted_at: string | null;
          invited_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          email: string;
          role?: Database["public"]["Enums"]["role_enum"];
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          invited_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["role_enum"];
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          invited_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_invites_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_invites_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          organization_id: string;
          sender_id: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          sender_id: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          sender_id?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      platforms: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platforms_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          default_price: number | null;
          active: boolean;
          created_at: string;
          updated_at: string;
          product_type: "standard" | "subscription_monthly" | "subscription_yearly";
          registration_fee_options: number[];
          default_recurring_price: number | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          default_price?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          product_type?: "standard" | "subscription_monthly" | "subscription_yearly";
          registration_fee_options?: number[];
          default_recurring_price?: number | null;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          default_price?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          product_type?: "standard" | "subscription_monthly" | "subscription_yearly";
          registration_fee_options?: number[];
          default_recurring_price?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      closers: {
        Row: {
          id: string;
          organization_id: string;
          profile_id: string | null;
          name: string;
          commission_rate: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          profile_id?: string | null;
          name: string;
          commission_rate?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          profile_id?: string | null;
          name?: string;
          commission_rate?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "closers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "closers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sales_partners: {
        Row: {
          id: string;
          organization_id: string;
          profile_id: string | null;
          name: string;
          commission_rate: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          profile_id?: string | null;
          name: string;
          commission_rate?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          profile_id?: string | null;
          name?: string;
          commission_rate?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_partners_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_partners_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deals: {
        Row: {
          id: string;
          organization_id: string;
          customer_name: string;
          customer_email: string | null;
          platform_id: string | null;
          payment_method: string | null;
          product_id: string | null;
          order_id: string | null;
          sales_partner_id: string | null;
          closer_id: string | null;
          total_price: number;
          payment_type: Database["public"]["Enums"]["payment_type_enum"];
          close_date: string;
          inkasso_required: boolean;
          mahnung_required: boolean;
          chargeback: boolean;
          storniert: boolean;
          onboarding_done: boolean;
          update_call_done: boolean;
          notes: string | null;
          down_payment: number | null;
          recurring_amount: number | null;
          subscription_start_date: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          customer_name: string;
          customer_email?: string | null;
          platform_id?: string | null;
          payment_method?: string | null;
          product_id?: string | null;
          order_id?: string | null;
          sales_partner_id?: string | null;
          closer_id?: string | null;
          total_price: number;
          payment_type?: Database["public"]["Enums"]["payment_type_enum"];
          close_date: string;
          inkasso_required?: boolean;
          mahnung_required?: boolean;
          chargeback?: boolean;
          storniert?: boolean;
          onboarding_done?: boolean;
          update_call_done?: boolean;
          notes?: string | null;
          down_payment?: number | null;
          recurring_amount?: number | null;
          subscription_start_date?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          customer_name?: string;
          customer_email?: string | null;
          platform_id?: string | null;
          payment_method?: string | null;
          product_id?: string | null;
          order_id?: string | null;
          sales_partner_id?: string | null;
          closer_id?: string | null;
          total_price?: number;
          payment_type?: Database["public"]["Enums"]["payment_type_enum"];
          close_date?: string;
          inkasso_required?: boolean;
          mahnung_required?: boolean;
          chargeback?: boolean;
          storniert?: boolean;
          onboarding_done?: boolean;
          update_call_done?: boolean;
          notes?: string | null;
          down_payment?: number | null;
          recurring_amount?: number | null;
          subscription_start_date?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deals_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_platform_id_fkey";
            columns: ["platform_id"];
            isOneToOne: false;
            referencedRelation: "platforms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_closer_id_fkey";
            columns: ["closer_id"];
            isOneToOne: false;
            referencedRelation: "closers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_sales_partner_id_fkey";
            columns: ["sales_partner_id"];
            isOneToOne: false;
            referencedRelation: "sales_partners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deals_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      installments: {
        Row: {
          id: string;
          organization_id: string;
          deal_id: string;
          sequence: number;
          due_date: string;
          amount: number;
          paid: boolean;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          deal_id: string;
          sequence: number;
          due_date: string;
          amount: number;
          paid?: boolean;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          deal_id?: string;
          sequence?: number;
          due_date?: string;
          amount?: number;
          paid?: boolean;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscription_payments: {
        Row: {
          id: string;
          organization_id: string;
          deal_id: string;
          sequence: number;
          due_date: string;
          amount: number;
          paid: boolean;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          deal_id: string;
          sequence?: number;
          due_date: string;
          amount: number;
          paid?: boolean;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          deal_id?: string;
          sequence?: number;
          due_date?: string;
          amount?: number;
          paid?: boolean;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      one_time_payments: {
        Row: {
          deal_id: string;
          organization_id: string;
          paid: boolean;
          paid_at: string | null;
          due_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          deal_id: string;
          organization_id: string;
          paid?: boolean;
          paid_at?: string | null;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          deal_id?: string;
          organization_id?: string;
          paid?: boolean;
          paid_at?: string | null;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inkasso_cases: {
        Row: {
          id: string;
          organization_id: string;
          deal_id: string;
          sent_to_inkasso_at: string;
          agency: string | null;
          status: Database["public"]["Enums"]["inkasso_status_enum"];
          recovered_amount: number | null;
          closed_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          deal_id: string;
          sent_to_inkasso_at?: string;
          agency?: string | null;
          status?: Database["public"]["Enums"]["inkasso_status_enum"];
          recovered_amount?: number | null;
          closed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          deal_id?: string;
          sent_to_inkasso_at?: string;
          agency?: string | null;
          status?: Database["public"]["Enums"]["inkasso_status_enum"];
          recovered_amount?: number | null;
          closed_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      import_aliases: {
        Row: {
          id: string;
          organization_id: string;
          entity_type: "product" | "platform" | "closer";
          raw_value: string;
          target_id: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          entity_type: "product" | "platform" | "closer";
          raw_value: string;
          target_id: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          entity_type?: "product" | "platform" | "closer";
          raw_value?: string;
          target_id?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      deal_balance: {
        Row: {
          deal_id: string;
          organization_id: string;
          paid_sum: number;
          open_sum: number;
          overdue_sum: number;
          has_overdue: boolean;
        };
        Relationships: [];
      };
      import_batches: {
        Row: {
          id: string;
          organization_id: string;
          created_by: string | null;
          source: string;
          filename: string | null;
          row_count: number;
          created_count: number;
          paid_count: number;
          skipped_count: number;
          review_count: number;
          error_count: number;
          status: "pending" | "completed" | "failed" | "rolled_back";
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          created_by?: string | null;
          source: string;
          filename?: string | null;
          row_count?: number;
          created_count?: number;
          paid_count?: number;
          skipped_count?: number;
          review_count?: number;
          error_count?: number;
          status?: "pending" | "completed" | "failed" | "rolled_back";
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          created_by?: string | null;
          source?: string;
          filename?: string | null;
          row_count?: number;
          created_count?: number;
          paid_count?: number;
          skipped_count?: number;
          review_count?: number;
          error_count?: number;
          status?: "pending" | "completed" | "failed" | "rolled_back";
          created_at?: string;
        };
        Relationships: [];
      };
      import_rows: {
        Row: {
          id: string;
          batch_id: string;
          organization_id: string;
          row_number: number;
          synthetic_key: string;
          action: string;
          classification: string;
          deal_id: string | null;
          installment_id: string | null;
          raw_data: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          organization_id: string;
          row_number: number;
          synthetic_key: string;
          action: string;
          classification: string;
          deal_id?: string | null;
          installment_id?: string | null;
          raw_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          batch_id?: string;
          organization_id?: string;
          row_number?: number;
          synthetic_key?: string;
          action?: string;
          classification?: string;
          deal_id?: string | null;
          installment_id?: string | null;
          raw_data?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
      deals_with_status: {
        Row: {
          id: string;
          organization_id: string;
          customer_name: string;
          platform_id: string | null;
          payment_method: string | null;
          product_id: string | null;
          order_id: string | null;
          sales_partner_id: string | null;
          closer_id: string | null;
          total_price: number;
          payment_type: Database["public"]["Enums"]["payment_type_enum"];
          close_date: string;
          inkasso_required: boolean;
          mahnung_required: boolean;
          onboarding_done: boolean;
          update_call_done: boolean;
          chargeback: boolean;
          storniert: boolean;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          down_payment: number | null;
          recurring_amount: number | null;
          subscription_start_date: string | null;
          paid_sum: number;
          open_sum: number;
          overdue_sum: number;
          has_overdue: boolean;
          computed_status: "paid" | "open" | "overdue" | "in_collection";
        };
        Relationships: [];
      };
      deals_overdue: {
        Row: {
          id: string;
          organization_id: string;
          customer_name: string;
          total_price: number;
          close_date: string;
          paid_sum: number;
          open_sum: number;
          overdue_sum: number;
          has_overdue: boolean;
          computed_status: "paid" | "open" | "overdue" | "in_collection";
        };
        Relationships: [];
      };
    };
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: {
      role_enum: "admin" | "closer" | "sales_partner";
      payment_type_enum: "one_time" | "installments" | "subscription_monthly" | "subscription_yearly";
      inkasso_status_enum: "sent" | "in_recovery" | "recovered" | "written_off";
    };
    CompositeTypes: Record<string, unknown>;
  };
};
