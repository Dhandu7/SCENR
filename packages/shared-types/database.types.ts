// Generated from the live Supabase schema (supabase/migrations/0001_init.sql).
// Regenerate via the Supabase MCP `generate_typescript_types` tool after schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      contributors: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          session_token: string
          trip_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          session_token: string
          trip_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          session_token?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributors_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      generations: {
        Row: {
          caption: string | null
          caption_mode: Database["public"]["Enums"]["caption_mode"] | null
          completed_at: string | null
          created_at: string
          id: string
          length_preset: string | null
          output_url: string | null
          seed: number | null
          selection: Json | null
          status: Database["public"]["Enums"]["generation_status"]
          theme_id: string | null
          trip_id: string
          type: Database["public"]["Enums"]["generation_type"]
          watermark: boolean
        }
        Insert: {
          caption?: string | null
          caption_mode?: Database["public"]["Enums"]["caption_mode"] | null
          completed_at?: string | null
          created_at?: string
          id?: string
          length_preset?: string | null
          output_url?: string | null
          seed?: number | null
          selection?: Json | null
          status?: Database["public"]["Enums"]["generation_status"]
          theme_id?: string | null
          trip_id: string
          type: Database["public"]["Enums"]["generation_type"]
          watermark?: boolean
        }
        Update: {
          caption?: string | null
          caption_mode?: Database["public"]["Enums"]["caption_mode"] | null
          completed_at?: string | null
          created_at?: string
          id?: string
          length_preset?: string | null
          output_url?: string | null
          seed?: number | null
          selection?: Json | null
          status?: Database["public"]["Enums"]["generation_status"]
          theme_id?: string | null
          trip_id?: string
          type?: Database["public"]["Enums"]["generation_type"]
          watermark?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "generations_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "theme_fingerprints"
            referencedColumns: ["theme_id"]
          },
          {
            foreignKeyName: "generations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      media_items: {
        Row: {
          content_category:
            | Database["public"]["Enums"]["content_category"]
            | null
          contributor_id: string | null
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          is_favourite: boolean
          quality_score: number | null
          storage_path: string
          theme_fit_scores: Json
          thumbnail_path: string | null
          trip_id: string
          type: Database["public"]["Enums"]["media_type"]
          width: number | null
        }
        Insert: {
          content_category?:
            | Database["public"]["Enums"]["content_category"]
            | null
          contributor_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          is_favourite?: boolean
          quality_score?: number | null
          storage_path: string
          theme_fit_scores?: Json
          thumbnail_path?: string | null
          trip_id: string
          type: Database["public"]["Enums"]["media_type"]
          width?: number | null
        }
        Update: {
          content_category?:
            | Database["public"]["Enums"]["content_category"]
            | null
          contributor_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          is_favourite?: boolean
          quality_score?: number | null
          storage_path?: string
          theme_fit_scores?: Json
          thumbnail_path?: string | null
          trip_id?: string
          type?: Database["public"]["Enums"]["media_type"]
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_items_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          generations_used: number
          id: string
          tier: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          generations_used?: number
          id: string
          tier?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          generations_used?: number
          id?: string
          tier?: string
        }
        Relationships: []
      }
      theme_fingerprints: {
        Row: {
          centroid_vec: string | null
          composition_template: Json | null
          display_name: string
          notes: string | null
          palette: Json | null
          refreshed_at: string | null
          sample_count: number | null
          theme_id: string
        }
        Insert: {
          centroid_vec?: string | null
          composition_template?: Json | null
          display_name: string
          notes?: string | null
          palette?: Json | null
          refreshed_at?: string | null
          sample_count?: number | null
          theme_id: string
        }
        Update: {
          centroid_vec?: string | null
          composition_template?: Json | null
          display_name?: string
          notes?: string | null
          palette?: Json | null
          refreshed_at?: string | null
          sample_count?: number | null
          theme_id?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          archived_at: string | null
          cover_image_url: string | null
          created_at: string
          dates: unknown
          destination: string | null
          id: string
          name: string
          owner_id: string
          slug: string
        }
        Insert: {
          archived_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          dates?: unknown
          destination?: string | null
          id?: string
          name: string
          owner_id: string
          slug: string
        }
        Update: {
          archived_at?: string | null
          cover_image_url?: string | null
          created_at?: string
          dates?: unknown
          destination?: string | null
          id?: string
          name?: string
          owner_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      caption_mode: "generated" | "custom" | "preset"
      content_category:
        | "solo_portrait"
        | "group"
        | "scenery"
        | "food"
        | "action_fit"
        | "candid_funny"
      generation_status: "pending" | "processing" | "complete" | "failed"
      generation_type: "post" | "carousel" | "story"
      media_type: "photo" | "video"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals["public"]

export type Tables<
  T extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][T]["Row"]

export type TablesInsert<
  T extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][T]["Insert"]

export type TablesUpdate<
  T extends keyof DefaultSchema["Tables"],
> = DefaultSchema["Tables"][T]["Update"]

export type Enums<T extends keyof DefaultSchema["Enums"]> =
  DefaultSchema["Enums"][T]
