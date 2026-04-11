export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      api_activity_log: {
        Row: {
          address: string | null
          created_at: string
          event_type: string
          id: string
          job_id: string | null
          message: string
          metadata: Json | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          event_type: string
          id?: string
          job_id?: string | null
          message: string
          metadata?: Json | null
        }
        Update: {
          address?: string | null
          created_at?: string
          event_type?: string
          id?: string
          job_id?: string | null
          message?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "api_activity_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "api_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      api_deal_history: {
        Row: {
          address_normalized: string
          created_at: string
          deal_id: string | null
          id: string
          purchase_price: number | null
          updated_at: string
          zipcode: string
        }
        Insert: {
          address_normalized: string
          created_at?: string
          deal_id?: string | null
          id?: string
          purchase_price?: number | null
          updated_at?: string
          zipcode: string
        }
        Update: {
          address_normalized?: string
          created_at?: string
          deal_id?: string | null
          id?: string
          purchase_price?: number | null
          updated_at?: string
          zipcode?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_deal_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      api_jobs: {
        Row: {
          callback_url: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          params: Json
          processed_count: number | null
          results: Json | null
          started_at: string | null
          status: string
          total_properties: number | null
          zipcode: string
        }
        Insert: {
          callback_url?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          params?: Json
          processed_count?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string
          total_properties?: number | null
          zipcode: string
        }
        Update: {
          callback_url?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          params?: Json
          processed_count?: number | null
          results?: Json | null
          started_at?: string | null
          status?: string
          total_properties?: number | null
          zipcode?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key: string
          last_used_at: string | null
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key?: string
          last_used_at?: string | null
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key?: string
          last_used_at?: string | null
          name?: string
        }
        Relationships: []
      }
      deal_investors: {
        Row: {
          created_at: string
          deal_id: string
          id: string
          investor_id: string
          investor_notes: string | null
          notes: string | null
          preferred_return_percent: number | null
          profit_split_percent: number | null
          visible_strategies: string[] | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          id?: string
          investor_id: string
          investor_notes?: string | null
          notes?: string | null
          preferred_return_percent?: number | null
          profit_split_percent?: number | null
          visible_strategies?: string[] | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          id?: string
          investor_id?: string
          investor_notes?: string | null
          notes?: string | null
          preferred_return_percent?: number | null
          profit_split_percent?: number | null
          visible_strategies?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_investors_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_investors_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          address_city: string
          address_full: string
          address_state: string
          address_street: string
          address_zip: string | null
          api_data: Json | null
          created_at: string
          created_by: string | null
          deal_type: string | null
          email_date: string | null
          email_extracted_data: Json | null
          email_id: string | null
          email_snippet: string | null
          email_subject: string | null
          financials: Json | null
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          is_locked: boolean
          job_id: string | null
          notes: string | null
          overrides: Json | null
          rejection_reason: string | null
          scout_ai_data: Json | null
          sender_email: string | null
          sender_name: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          address_city?: string
          address_full: string
          address_state?: string
          address_street: string
          address_zip?: string | null
          api_data?: Json | null
          created_at?: string
          created_by?: string | null
          deal_type?: string | null
          email_date?: string | null
          email_extracted_data?: Json | null
          email_id?: string | null
          email_snippet?: string | null
          email_subject?: string | null
          financials?: Json | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_locked?: boolean
          job_id?: string | null
          notes?: string | null
          overrides?: Json | null
          rejection_reason?: string | null
          scout_ai_data?: Json | null
          sender_email?: string | null
          sender_name?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          address_city?: string
          address_full?: string
          address_state?: string
          address_street?: string
          address_zip?: string | null
          api_data?: Json | null
          created_at?: string
          created_by?: string | null
          deal_type?: string | null
          email_date?: string | null
          email_extracted_data?: Json | null
          email_id?: string | null
          email_snippet?: string | null
          email_subject?: string | null
          financials?: Json | null
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          is_locked?: boolean
          job_id?: string | null
          notes?: string | null
          overrides?: Json | null
          rejection_reason?: string | null
          scout_ai_data?: Json | null
          sender_email?: string | null
          sender_name?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "api_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          profit_split_percent: number | null
          strategies: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          profit_split_percent?: number | null
          strategies?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          profit_split_percent?: number | null
          strategies?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sync_history: {
        Row: {
          deals_created: number
          deals_skipped_duplicate: number
          deals_skipped_portal: number
          details: Json | null
          errors: string[] | null
          id: string
          portal_emails: string[] | null
          skipped_addresses: string[] | null
          synced_at: string
          total_emails_scanned: number
        }
        Insert: {
          deals_created?: number
          deals_skipped_duplicate?: number
          deals_skipped_portal?: number
          details?: Json | null
          errors?: string[] | null
          id?: string
          portal_emails?: string[] | null
          skipped_addresses?: string[] | null
          synced_at?: string
          total_emails_scanned?: number
        }
        Update: {
          deals_created?: number
          deals_skipped_duplicate?: number
          deals_skipped_portal?: number
          details?: Json | null
          errors?: string[] | null
          id?: string
          portal_emails?: string[] | null
          skipped_addresses?: string[] | null
          synced_at?: string
          total_emails_scanned?: number
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          selected_state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          selected_state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          selected_state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "investor" | "agent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "investor", "agent"],
    },
  },
} as const
