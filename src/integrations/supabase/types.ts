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
          import_idempotency_key: string | null
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
          import_idempotency_key?: string | null
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
          import_idempotency_key?: string | null
          open_questions?: Json
          status?: string
          transcript_retention?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      external_identities: {
        Row: {
          created_at: string
          external_subject_hash: string
          id: string
          proof_method: string | null
          source_system: string
          source_tenant: string
          status: string
          updated_at: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          external_subject_hash: string
          id?: string
          proof_method?: string | null
          source_system: string
          source_tenant: string
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          external_subject_hash?: string
          id?: string
          proof_method?: string | null
          source_system?: string
          source_tenant?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      migration_records: {
        Row: {
          entity_kind: string
          error_code: string | null
          id: string
          imported_at: string | null
          run_id: string
          source_key_hmac: string
          source_payload_hash: string
          source_updated_at: string | null
          status: string
          target_id: string | null
          target_kind: string | null
        }
        Insert: {
          entity_kind: string
          error_code?: string | null
          id?: string
          imported_at?: string | null
          run_id: string
          source_key_hmac: string
          source_payload_hash: string
          source_updated_at?: string | null
          status?: string
          target_id?: string | null
          target_kind?: string | null
        }
        Update: {
          entity_kind?: string
          error_code?: string | null
          id?: string
          imported_at?: string | null
          run_id?: string
          source_key_hmac?: string
          source_payload_hash?: string
          source_updated_at?: string | null
          status?: string
          target_id?: string | null
          target_kind?: string | null
        }
        Relationships: []
      }
      migration_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          exporter_version: string
          field_map_version: string
          id: string
          snapshot_at: string
          source_counts: Json
          source_hashes: Json
          source_system: string
          source_tenant: string
          started_at: string | null
          status: string
          target_counts: Json
          target_hashes: Json
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          exporter_version: string
          field_map_version: string
          id?: string
          snapshot_at: string
          source_counts?: Json
          source_hashes?: Json
          source_system: string
          source_tenant: string
          started_at?: string | null
          status?: string
          target_counts?: Json
          target_hashes?: Json
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          exporter_version?: string
          field_map_version?: string
          id?: string
          snapshot_at?: string
          source_counts?: Json
          source_hashes?: Json
          source_system?: string
          source_tenant?: string
          started_at?: string | null
          status?: string
          target_counts?: Json
          target_hashes?: Json
        }
        Relationships: []
      }
      party_collaboration_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          party_id: string
          revoked_at: string | null
          role: string
          token_hash: string
          token_hint: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          party_id: string
          revoked_at?: string | null
          role?: string
          token_hash: string
          token_hint: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          party_id?: string
          revoked_at?: string | null
          role?: string
          token_hash?: string
          token_hint?: string
        }
        Relationships: []
      }
      party_memberships: {
        Row: {
          created_at: string
          display_name: string | null
          joined_at: string
          party_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          joined_at?: string
          party_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          joined_at?: string
          party_id?: string
          role?: string
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
          import_local_id: string | null
          location: string | null
          name: string
          occasion: string
          planning_profile: Json
          photo_drop: Json | null
          pinned_inspiration: Json
          retrospective: Json | null
          rsvp_token: string
          shopping_items: Json
          start_time: string | null
          tasks: Json
          theme: string
          theme_id: string | null
          time_zone: string | null
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
          import_local_id?: string | null
          location?: string | null
          name: string
          occasion: string
          planning_profile?: Json
          photo_drop?: Json | null
          pinned_inspiration?: Json
          retrospective?: Json | null
          rsvp_token?: string
          shopping_items?: Json
          start_time?: string | null
          tasks?: Json
          theme?: string
          theme_id?: string | null
          time_zone?: string | null
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
          import_local_id?: string | null
          location?: string | null
          name?: string
          occasion?: string
          planning_profile?: Json
          photo_drop?: Json | null
          pinned_inspiration?: Json
          retrospective?: Json | null
          rsvp_token?: string
          shopping_items?: Json
          start_time?: string | null
          tasks?: Json
          theme?: string
          theme_id?: string | null
          time_zone?: string | null
          timeline?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rsvp_action_budget: {
        Row: {
          action: string
          bucket_start: string
          count: number
          party_id: string
        }
        Insert: {
          action: string
          bucket_start: string
          count?: number
          party_id: string
        }
        Update: {
          action?: string
          bucket_start?: string
          count?: number
          party_id?: string
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
      _bump_rsvp_budget: {
        Args: {
          _action: string
          _bucket_seconds: number
          _limit: number
          _party_id: string
        }
        Returns: boolean
      }
      _validate_confirm_collection: {
        Args: { _max_bytes: number; _max_items: number; _val: Json }
        Returns: undefined
      }
      bump_ai_turn: { Args: { _draft_id: string }; Returns: Json }
      accept_collaboration_invite: {
        Args: { _display_name: string; _token: string }
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
      create_collaboration_invite: {
        Args: { _expires_in_hours?: number; _party_id: string }
        Returns: Json
      }
      delete_own_account: { Args: never; Returns: Json }
      get_rsvp_party: { Args: { token: string }; Returns: Json }
      get_rsvp_party_v2: { Args: { token: string }; Returns: Json }
      list_bring_board: { Args: { token: string }; Returns: Json }
      leave_party: { Args: { _party_id: string }; Returns: Json }
      list_party_people: { Args: { _party_id: string }; Returns: Json }
      remove_party_member: {
        Args: { _party_id: string; _user_id: string }
        Returns: Json
      }
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
      submit_rsvp_v2: {
        Args: {
          adults: number
          allergens?: Json
          dietary?: Json
          guest_name: string
          household_label?: string
          kids: number
          response_details?: Json
          rsvp: string
          token: string
        }
        Returns: Json
      }
      revoke_collaboration_invite: {
        Args: { _invitation_id: string; _party_id: string }
        Returns: Json
      }
      transfer_party_ownership: {
        Args: { _new_owner_id: string; _party_id: string }
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
