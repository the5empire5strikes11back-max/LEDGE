export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type RankKey = 'rookie' | 'forecaster' | 'analyst' | 'oracle' | 'marketMaker' | 'juryLead'
export type MarketCategory = 'Sports' | 'Politics' | 'Culture' | 'Circle'
export type BetSide = 'yes' | 'no'
export type ChestTier = 'common' | 'rare' | 'epic' | 'legendary'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          rank: RankKey
          xp: number
          credits: number
          streak: number
          is_plus: boolean
          margin_debt: number
          loss_streak: number
          comeback_eligible: boolean
          last_active_at: string
          created_at: string
        }
        Insert: {
          id: string
          username: string
          rank?: RankKey
          xp?: number
          credits?: number
          streak?: number
          is_plus?: boolean
          margin_debt?: number
          loss_streak?: number
          comeback_eligible?: boolean
          last_active_at?: string
          created_at?: string
        }
        Update: {
          rank?: RankKey
          xp?: number
          credits?: number
          streak?: number
          is_plus?: boolean
          margin_debt?: number
          loss_streak?: number
          comeback_eligible?: boolean
          last_active_at?: string
        }
        Relationships: []
      }
      markets: {
        Row: {
          id: string
          title: string
          category: MarketCategory
          end_time: string
          yes_percent: number
          total_credits: number
          yes_pool: number
          no_pool: number
          jackpot_pool: number
          circle_id: string | null
          resolved: boolean
          winner: BetSide | null
          created_by: string | null
          created_at: string
          resolution_criteria: string | null
          resolution_source_url: string | null
          target_data_key: string | null
          hot_score: number
          momentum_shift: number
          is_featured: boolean
          // Queue architecture fields
          status: 'queued' | 'live' | 'archived'
          published_at: string | null
          generated_at: string | null
        }
        Insert: {
          title: string
          category: MarketCategory
          end_time: string
          yes_percent?: number
          total_credits?: number
          yes_pool?: number
          no_pool?: number
          jackpot_pool?: number
          circle_id?: string | null
          resolved?: boolean
          winner?: BetSide | null
          created_by?: string | null
          resolution_criteria?: string | null
          resolution_source_url?: string | null
          target_data_key?: string | null
          hot_score?: number
          momentum_shift?: number
          is_featured?: boolean
          status?: 'queued' | 'live' | 'archived'
          published_at?: string | null
          generated_at?: string | null
        }
        Update: {
          yes_percent?: number
          total_credits?: number
          yes_pool?: number
          no_pool?: number
          resolved?: boolean
          winner?: BetSide | null
          hot_score?: number
          momentum_shift?: number
          is_featured?: boolean
          status?: 'queued' | 'live' | 'archived'
          published_at?: string | null
          generated_at?: string | null
        }
        Relationships: []
      }
      bets: {
        Row: {
          id: string
          user_id: string
          market_id: string
          side: BetSide
          amount: number
          payout: number | null
          won: boolean | null
          created_at: string
        }
        Insert: {
          user_id: string
          market_id: string
          side: BetSide
          amount: number
          payout?: number | null
          won?: boolean | null
        }
        Update: {
          payout?: number | null
          won?: boolean | null
        }
        Relationships: []
      }
      circles: {
        Row: {
          id: string
          name: string
          created_by: string
          invite_code: string
          created_at: string
        }
        Insert: {
          name: string
          created_by: string
          invite_code?: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      circle_members: {
        Row: {
          circle_id: string
          user_id: string
          joined_at: string
        }
        Insert: {
          circle_id: string
          user_id: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      pnl_snapshots: {
        Row: {
          id: string
          user_id: string
          credits: number
          created_at: string
        }
        Insert: {
          user_id: string
          credits: number
        }
        Update: Record<string, never>
        Relationships: []
      }
      daily_drops: {
        Row: {
          id: string
          user_id: string
          amount: number
          chest_tier: ChestTier | null
          chest_amount: number
          claimed_at: string
        }
        Insert: {
          user_id: string
          amount: number
          chest_tier?: ChestTier | null
          chest_amount?: number
        }
        Update: Record<string, never>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
