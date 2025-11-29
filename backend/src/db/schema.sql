-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Artists table
CREATE TABLE IF NOT EXISTS artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  profile_picture TEXT,

  -- Original Location
  original_city VARCHAR(100) NOT NULL,
  original_province VARCHAR(100) NOT NULL,
  original_coordinates GEOGRAPHY(POINT, 4326) NOT NULL,

  -- Active Location
  active_city VARCHAR(100) NOT NULL,
  active_province VARCHAR(100) NOT NULL,
  active_coordinates GEOGRAPHY(POINT, 4326) NOT NULL,

  -- Additional Info
  bio TEXT,
  instagram_url TEXT,
  twitter_url TEXT,
  spotify_url TEXT,
  website_url TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_artists_original_coords ON artists USING GIST(original_coordinates);
CREATE INDEX idx_artists_active_coords ON artists USING GIST(active_coordinates);
CREATE INDEX idx_artists_name ON artists(name);
CREATE INDEX idx_artists_original_city ON artists(original_city);
CREATE INDEX idx_artists_active_city ON artists(active_city);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_artists_updated_at
  BEFORE UPDATE ON artists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
