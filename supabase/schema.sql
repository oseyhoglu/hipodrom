-- TJK Hipodrom Cloud Database Schema
-- Run this in Supabase SQL Editor

-- Yarış günleri ve bültenler
CREATE TABLE IF NOT EXISTS bulletins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    race_date DATE NOT NULL,
    city_key TEXT NOT NULL,
    city_name TEXT NOT NULL,
    city_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(race_date, city_key)
);

-- Koşu bilgileri
CREATE TABLE IF NOT EXISTS races (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bulletin_id UUID REFERENCES bulletins(id) ON DELETE CASCADE,
    race_no INTEGER NOT NULL,
    race_name TEXT,
    race_time TIME NOT NULL,
    race_type TEXT,
    has_altili BOOLEAN DEFAULT FALSE,
    altili_no INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bulletin_id, race_no)
);

-- At bilgileri
CREATE TABLE IF NOT EXISTS horses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id UUID REFERENCES races(id) ON DELETE CASCADE,
    horse_no INTEGER NOT NULL,
    horse_name TEXT,
    jockey_name TEXT,
    last_6_races TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(race_id, horse_no)
);

-- Periyodik oran okumaları
CREATE TABLE IF NOT EXISTS readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID REFERENCES horses(id) ON DELETE CASCADE,
    read_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ganyan NUMERIC,
    sabit_ganyan NUMERIC,
    agf1 NUMERIC,
    agf1_rank INTEGER,
    agf2 NUMERIC,
    agf2_rank INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performans index'leri
CREATE INDEX IF NOT EXISTS idx_bulletins_date ON bulletins(race_date);
CREATE INDEX IF NOT EXISTS idx_races_bulletin ON races(bulletin_id);
CREATE INDEX IF NOT EXISTS idx_horses_race ON horses(race_id);
CREATE INDEX IF NOT EXISTS idx_readings_horse_time ON readings(horse_id, read_time);

-- Row Level Security (herkese okuma izni, yazma sadece service role ile)
ALTER TABLE bulletins ENABLE ROW LEVEL SECURITY;
ALTER TABLE races ENABLE ROW LEVEL SECURITY;
ALTER TABLE horses ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (public dashboard)
CREATE POLICY "Public read bulletins" ON bulletins FOR SELECT USING (true);
CREATE POLICY "Public read races" ON races FOR SELECT USING (true);
CREATE POLICY "Public read horses" ON horses FOR SELECT USING (true);
CREATE POLICY "Public read readings" ON readings FOR SELECT USING (true);

-- Anon key ile de yazabilsin (API routes için)
CREATE POLICY "Anon insert bulletins" ON bulletins FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon insert races" ON races FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon insert horses" ON horses FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon insert readings" ON readings FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon update bulletins" ON bulletins FOR UPDATE USING (true);
CREATE POLICY "Anon update races" ON races FOR UPDATE USING (true);
CREATE POLICY "Anon update horses" ON horses FOR UPDATE USING (true);

-- Enable Realtime for readings table
ALTER PUBLICATION supabase_realtime ADD TABLE readings;
