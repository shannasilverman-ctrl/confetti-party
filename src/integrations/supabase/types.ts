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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      gathering_drafts: {
        Row: {
          ai_turns: number
          ai_turns_hour_start: string | null
          assumptions: Json
          confirmed_party_id: string | null
          created_at: string
          draft: Json
          id: string
          open_questions: Json
          status: string
          transcript_retention: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_turns?: number
          ai_turns_hour_start?: string | null
          assumptions?: Json
          confirmed_party_id?: string | null
          created_at?: string
          draft?: Json
          id?: string
          open_questions?: Json
          status?: string
          transcript_retention?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_turns?: number
          ai_turns_hour_start?: string | null
          assumptions?: Json
          confirmed_party_id?: string | null
          created_at?: string
          draft?: Json
          id?: string
          open_questions?: Json
          status?: string
          transcript_retention?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          bring_board: Json
          budget: number
          budget_categories: Json
          checkins: Json
          created_at: string
          date: string
          guest_estimate: number
          guests: Json
          holiday_pack_id: string | null
          host_note: string | null
          host_updates: Json
          households: Json
          id: string
          location: string | null
          name: string
          occasion: string
          photo_drop: Json | null
          pinned_inspiration: Json
          retrospective: Json | null
          rsvp_token: string
          shopping_items: Json
          start_time: string | null
          tasks: Json
          theme: string
          theme_id: string | null
          timeline: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          bring_board?: Json
          budget?: number
          budget_categories?: Json
          checkins?: Json
          created_at?: string
          date: string
          guest_estimate?: number
          guests?: Json
          holiday_pack_id?: string | null
          host_note?: string | null
          host_updates?: Json
          households?: Json
          id?: string
          location?: string | null
          name: string
          occasion: string
          photo_drop?: Json | null
          pinned_inspiration?: Json
          retrospective?: Json | null
          rsvp_token?: string
          shopping_items?: Json
          start_time?: string | null
          tasks?: Json
          theme?: string
          theme_id?: string | null
          timeline?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          bring_board?: Json
          budget?: number
          budget_categories?: Json
          checkins?: Json
          created_at?: string
          date?: string
          guest_estimate?: number
          guests?: Json
          holiday_pack_id?: string | null
          host_note?: string | null
          host_updates?: Json
          households?: Json
          id?: string
          location?: string | null
          name?: string
          occasion?: string
          photo_drop?: Json | null
          pinned_inspiration?: Json
          retrospective?: Json | null
          rsvp_token?: string
          shopping_items?: Json
          start_time?: string | null
          tasks?: Json
          theme?: string
          theme_id?: string | null
          timeline?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      talk_sessions: {
        Row: {
          audio_seconds_in: number | null
          audio_seconds_out: number | null
          cost_cents: number | null
          created_at: string
          disconnect_reason: string | null
          draft_id: string | null
          duration_s: number | null
          ended_at: string | null
          id: string
          model: string | null
          started_at: string
          tokens_input: number | null
          tokens_output: number | null
          user_id: string
        }
        Insert: {
          audio_seconds_in?: number | null
          audio_seconds_out?: number | null
          cost_cents?: number | null
          created_at?: string
          disconnect_reason?: string | null
          draft_id?: string | null
          duration_s?: number | null
          ended_at?: string | null
          id?: string
          model?: string | null
          started_at?: string
          tokens_input?: number | null
          tokens_output?: number | null
          user_id: string
        }
        Update: {
          audio_seconds_in?: number | null
          audio_seconds_out?: number | null
          cost_cents?: number | null
          created_at?: string
          disconnect_reason?: string | null
          draft_id?: string | null
          duration_s?: number | null
          ended_at?: string | null
          id?: string
          model?: string | null
          started_at?: string
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talk_sessions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "gathering_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      talk_transcripts: {
        Row: {
          created_at: string
          draft_id: string | null
          session_id: string
          transcript: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_id?: string | null
          session_id: string
          transcript?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          draft_id?: string | null
          session_id?: string
          transcript?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talk_transcripts_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "gathering_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talk_transcripts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "talk_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_ai_turn: {
        Args: { _cap: number; _draft_id: string; _window_ms: number }
        Returns: Json
      }
      claim_bring_item: {
        Args: {
          guest_name: string
          household_label?: string
          item_id: string
          qty?: number
          token: string
        }
        Returns: Json
      }
      confirm_gathering_draft: {
        Args: { _draft_id: string; _party: Json }
        Returns: Json
      }
      get_rsvp_party: { Args: { token: string }; Returns: Json }
      list_bring_board: { Args: { token: string }; Returns: Json }
      release_bring_item: {
        Args: {
          claim_secret?: string
          guest_name: string
          item_id: string
          token: string
        }
        Returns: Json
      }
      submit_rsvp: {
        Args: {
          adults: number
          allergens?: Json
          dietary?: Json
          guest_name: string
          household_label?: string
          kids: number
          rsvp: string
          token: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
