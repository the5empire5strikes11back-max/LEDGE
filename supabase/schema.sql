-- ============================================================
-- Ledge Database Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  rank TEXT DEFAULT 'rookie' CHECK (rank IN ('rookie', 'forecaster', 'analyst', 'oracle', 'marketMaker', 'juryLead')),
  xp INTEGER DEFAULT 0,
  credits INTEGER DEFAULT 5000,
  streak INTEGER DEFAULT 0,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Circles
CREATE TABLE circles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  invite_code TEXT UNIQUE DEFAULT SUBSTRING(gen_random_uuid()::TEXT, 1, 8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Circle members
CREATE TABLE circle_members (
  circle_id UUID REFERENCES circles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (circle_id, user_id)
);

-- Markets
CREATE TABLE markets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Sports', 'Politics', 'Culture', 'Circle')),
  end_time TIMESTAMPTZ NOT NULL,
  yes_percent FLOAT DEFAULT 50,
  total_credits BIGINT DEFAULT 0,
  jackpot_pool BIGINT DEFAULT 0,
  circle_id UUID REFERENCES circles(id),
  resolved BOOLEAN DEFAULT FALSE,
  winner TEXT CHECK (winner IN ('yes', 'no', NULL)),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bets
CREATE TABLE bets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  market_id UUID REFERENCES markets(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  payout BIGINT,
  won BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, market_id)
);

-- Daily drops (prevent duplicate claims per day)
CREATE TABLE daily_drops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  chest_tier TEXT CHECK (chest_tier IN ('common', 'rare', 'epic', 'legendary')),
  chest_amount INTEGER DEFAULT 0,
  claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_drops ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, only owner can update
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Circles: members can read their circles
CREATE POLICY "circles_select" ON circles FOR SELECT USING (
  id IN (SELECT circle_id FROM circle_members WHERE user_id = auth.uid())
  OR created_by = auth.uid()
);
CREATE POLICY "circles_insert" ON circles FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Circle members: members can see their circles
CREATE POLICY "circle_members_select" ON circle_members FOR SELECT USING (
  user_id = auth.uid() OR
  circle_id IN (SELECT circle_id FROM circle_members WHERE user_id = auth.uid())
);
CREATE POLICY "circle_members_insert" ON circle_members FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Markets: all authenticated users can read
CREATE POLICY "markets_select" ON markets FOR SELECT TO authenticated USING (true);
CREATE POLICY "markets_insert" ON markets FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Bets: users can see their own bets, and aggregate data
CREATE POLICY "bets_select_own" ON bets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "bets_insert" ON bets FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Daily drops: own only
CREATE POLICY "daily_drops_select" ON daily_drops FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "daily_drops_insert" ON daily_drops FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Functions
-- ============================================================

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update yes_percent when a bet is placed
CREATE OR REPLACE FUNCTION update_market_odds()
RETURNS TRIGGER AS $$
DECLARE
  yes_total BIGINT;
  no_total BIGINT;
  total BIGINT;
BEGIN
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE side = 'yes'), 0),
    COALESCE(SUM(amount) FILTER (WHERE side = 'no'), 0)
  INTO yes_total, no_total
  FROM bets WHERE market_id = NEW.market_id;

  total := yes_total + no_total;

  IF total > 0 THEN
    UPDATE markets SET
      yes_percent = ROUND((yes_total::FLOAT / total) * 100, 1),
      total_credits = total
    WHERE id = NEW.market_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_bet_placed
  AFTER INSERT ON bets
  FOR EACH ROW EXECUTE FUNCTION update_market_odds();

-- ============================================================
-- Seed: initial markets (optional)
-- ============================================================

INSERT INTO markets (title, category, end_time, yes_percent, total_credits, jackpot_pool) VALUES
('Will the Lakers beat the Warriors tonight?', 'Sports', NOW() + INTERVAL '4 hours', 62, 124500, 18000),
('Will Congress pass the AI Safety Bill this month?', 'Politics', NOW() + INTERVAL '3 days', 34, 892000, 125000),
('Will Drake drop a surprise album before summer?', 'Culture', NOW() + INTERVAL '2 days', 45, 567000, 0),
('Will the Fed cut rates at the next meeting?', 'Politics', NOW() + INTERVAL '6 days', 57, 2340000, 340000),
('Will Kendrick release new music this month?', 'Culture', NOW() + INTERVAL '20 days', 41, 456000, 0),
('Will the Chiefs make the Super Bowl next year?', 'Sports', NOW() + INTERVAL '180 days', 68, 3200000, 750000);
