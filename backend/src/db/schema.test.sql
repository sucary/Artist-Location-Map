-- Test Schema for Local PostgreSQL (Docker)
-- Mirrors production Supabase schema but with local auth

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Drop tables if they exist (reverse dependency order)
DROP TABLE IF EXISTS tour_artists CASCADE;
DROP TABLE IF EXISTS gig_artists CASCADE;
DROP TABLE IF EXISTS artist_gigs CASCADE;
DROP TABLE IF EXISTS artist_tours CASCADE;
DROP TABLE IF EXISTS place_locations CASCADE;
DROP TABLE IF EXISTS artists CASCADE;
DROP TABLE IF EXISTS artist_media_assets CASCADE;
DROP TABLE IF EXISTS artist_media_asset_reviews CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS rejected_registrations CASCADE;
DROP TABLE IF EXISTS media_upload_events CASCADE;
DROP TABLE IF EXISTS musicbrainz_artist_links CASCADE;
DROP TABLE IF EXISTS musicbrainz_artists CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS priority_locations CASCADE;
DROP TABLE IF EXISTS water_polygons CASCADE;
DROP TABLE IF EXISTS search_cache CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- Local Users Table (replaces Supabase auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Auto-update timestamp function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- Locations (cities, regions, countries, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    country VARCHAR(100),

    boundary GEOGRAPHY(MULTIPOLYGON, 4326),
    raw_boundary GEOGRAPHY(MULTIPOLYGON, 4326),
    center GEOGRAPHY(POINT, 4326),

    osm_id BIGINT NOT NULL,
    osm_type VARCHAR(20) NOT NULL,
    display_name TEXT,
    type VARCHAR(50),
    class VARCHAR(50),
    importance DECIMAL(5,4),
    bounding_box DECIMAL[4],
    address_components JSONB,

    -- Multilingual columns: old shape (migrations 001, 003) — kept until PR 5 cleanup
    names JSONB,
    admin_level INTEGER,
    parent_id UUID REFERENCES locations(id),
    localized_at TIMESTAMPTZ,
    -- New shape (migration 004): flat jsonb chain on each row
    localized_names JSONB,

    last_updated TIMESTAMP DEFAULT NOW(),
    needs_refresh BOOLEAN DEFAULT FALSE,

    CONSTRAINT uq_location_province UNIQUE (name, province),
    CONSTRAINT uq_location_osm UNIQUE (osm_id, osm_type)
);

-- ============================================
-- Priority Locations (search boosting, self-contained with all needed data)
-- ============================================
CREATE TABLE IF NOT EXISTS priority_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_query VARCHAR(100) NOT NULL,
    osm_id BIGINT NOT NULL,
    osm_type VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    province VARCHAR(100),
    country VARCHAR(100),
    display_name TEXT NOT NULL,
    lat DECIMAL(10, 7) NOT NULL,
    lng DECIMAL(10, 7) NOT NULL,
    rank INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT uq_priority_query_osm UNIQUE (search_query, osm_id, osm_type)
);

-- ============================================
-- Place Locations (point venues/POIs for Tour Mode)
-- ============================================
CREATE TABLE IF NOT EXISTS place_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    provider_place_id TEXT NOT NULL,
    name TEXT NOT NULL,
    formatted TEXT,
    address_line1 TEXT,
    address_line2 TEXT,
    city TEXT,
    province TEXT,
    country TEXT,
    country_code TEXT,
    coordinates GEOGRAPHY(POINT, 4326) NOT NULL,
    categories TEXT[] NOT NULL DEFAULT '{}',
    is_venue BOOLEAN NOT NULL DEFAULT FALSE,
    timezone TEXT,
    raw_provider_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_place_id)
);

-- ============================================
-- Location Search Suppressions
-- ============================================
CREATE TABLE IF NOT EXISTS location_search_suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_query VARCHAR(100) NOT NULL,
    suppressed_osm_id BIGINT NOT NULL,
    suppressed_osm_type VARCHAR(20) NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_location_search_suppression UNIQUE (
        normalized_query,
        suppressed_osm_id,
        suppressed_osm_type
    )
);

-- ============================================
-- Water Polygons
-- ============================================
CREATE TABLE IF NOT EXISTS water_polygons (
    gid SERIAL PRIMARY KEY,
    geom GEOGRAPHY(MULTIPOLYGON, 4326)
);

-- ============================================
-- Search Cache (Nominatim results)
-- ============================================
CREATE TABLE IF NOT EXISTS search_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL UNIQUE,
    results JSONB NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0,
    hit_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- ============================================
-- MusicBrainz Catalog
-- ============================================
CREATE TABLE IF NOT EXISTS musicbrainz_artists (
    mbid UUID PRIMARY KEY,
    name TEXT NOT NULL,
    sort_name TEXT,
    type TEXT,
    country VARCHAR(2),
    area_name TEXT,
    area_mbid UUID,
    begin_area_name TEXT,
    begin_area_mbid UUID,
    life_span_begin TEXT,
    life_span_end TEXT,
    ended BOOLEAN,
    disambiguation TEXT,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    alias_names TEXT[] NOT NULL DEFAULT '{}',
    alias_search_text TEXT NOT NULL DEFAULT '',
    alias_count INTEGER NOT NULL DEFAULT 0,
    genre_count INTEGER NOT NULL DEFAULT 0,
    tag_count INTEGER NOT NULL DEFAULT 0,
    relation_count INTEGER NOT NULL DEFAULT 0,
    website_url TEXT,
    wikidata_url TEXT,
    instagram_url TEXT,
    twitter_url TEXT,
    tiktok_url TEXT,
    youtube_url TEXT,
    spotify_url TEXT,
    apple_music_url TEXT,
    bandcamp_url TEXT,
    soundcloud_url TEXT,
    seed_sources TEXT[] NOT NULL DEFAULT '{}',
    popularity JSONB,
    global_rank INTEGER,
    regional_ranks JSONB NOT NULL DEFAULT '[]'::jsonb,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_approved BOOLEAN NOT NULL DEFAULT TRUE,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    location_language TEXT NOT NULL DEFAULT 'native',
    ui_language TEXT NOT NULL DEFAULT 'en',
    artist_name_display_mode TEXT NOT NULL DEFAULT 'both',
    tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    is_hard BOOLEAN NOT NULL DEFAULT FALSE,
    link_label TEXT,
    link_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    aggregation_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_visible
ON notifications(user_id, is_hard DESC, is_read ASC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_aggregation
ON notifications(user_id, aggregation_key)
WHERE aggregation_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS rejected_registrations (
    email TEXT PRIMARY KEY,
    rejected_user_id UUID,
    rejected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS musicbrainz_artist_links (
    id BIGSERIAL PRIMARY KEY,
    artist_mbid UUID NOT NULL REFERENCES musicbrainz_artists(mbid) ON DELETE CASCADE,
    url TEXT NOT NULL,
    host TEXT,
    relation_type TEXT NOT NULL DEFAULT 'url',
    category TEXT NOT NULL DEFAULT 'external',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_musicbrainz_artist_link UNIQUE (artist_mbid, url)
);

-- ============================================
-- Media Upload Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS media_upload_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    public_id TEXT NOT NULL UNIQUE,
    secure_url TEXT,
    bytes INTEGER,
    width INTEGER,
    height INTEGER,
    format TEXT,
    status TEXT NOT NULL DEFAULT 'signed' CHECK (status IN ('signed', 'uploaded', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS artist_media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    musicbrainz_mbid UUID NOT NULL UNIQUE REFERENCES musicbrainz_artists(mbid),
    source_image TEXT NOT NULL,
    avatar_crop JSONB,
    profile_crop JSONB,
    public_id TEXT,
    bytes INTEGER,
    width INTEGER,
    height INTEGER,
    format TEXT,
    original_uploaded_by UUID REFERENCES users(id),
    uploaded_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artist_media_asset_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    musicbrainz_mbid UUID NOT NULL REFERENCES musicbrainz_artists(mbid),
    source_image TEXT NOT NULL,
    avatar_crop JSONB,
    profile_crop JSONB,
    public_id TEXT,
    bytes INTEGER,
    width INTEGER,
    height INTEGER,
    format TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    submitted_by UUID REFERENCES users(id),
    reviewed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

-- ============================================
-- Artists
-- ============================================
CREATE TABLE IF NOT EXISTS artists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(255) NOT NULL,
    romanized_name TEXT,

    -- Image fields (after migration 002)
    source_image TEXT,
    avatar_crop JSONB,
    profile_crop JSONB,

    -- Original location
    original_city VARCHAR(100) NOT NULL,
    original_province VARCHAR(100) NOT NULL,
    original_country VARCHAR(100),
    original_display_name TEXT,
    original_coordinates GEOGRAPHY(POINT, 4326) NOT NULL,
    original_city_id UUID REFERENCES locations(id),
    original_display_coordinates GEOGRAPHY(POINT, 4326),

    -- Active location
    active_city VARCHAR(100) NOT NULL,
    active_province VARCHAR(100) NOT NULL,
    active_country VARCHAR(100),
    active_display_name TEXT,
    active_coordinates GEOGRAPHY(POINT, 4326) NOT NULL,
    active_city_id UUID REFERENCES locations(id),
    active_display_coordinates GEOGRAPHY(POINT, 4326),

    -- Social links (after migration 003)
    instagram_url TEXT,
    twitter_url TEXT,
    apple_music_url TEXT,
    youtube_url TEXT,
    website_url TEXT,

    -- Year fields
    debut_year INTEGER,
    inactive_year INTEGER,
    musicbrainz_mbid UUID REFERENCES musicbrainz_artists(mbid),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artist_tours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS artist_gigs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tour_id UUID REFERENCES artist_tours(id) ON DELETE SET NULL,
    gig_name VARCHAR(255),
    venue_name VARCHAR(255),
    city VARCHAR(255) NOT NULL,
    province VARCHAR(255) NOT NULL,
    country VARCHAR(100),
    display_name TEXT,
    city_id UUID REFERENCES locations(id),
    place_location_id UUID REFERENCES place_locations(id),
    coordinates GEOGRAPHY(POINT, 4326) NOT NULL,
    display_coordinates GEOGRAPHY(POINT, 4326) NOT NULL,
    "date" DATE NOT NULL,
    timezone TEXT,
    external_source TEXT,
    external_id TEXT,
    external_artist_id TEXT,
    external_url TEXT,
    imported_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    raw_external_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gig_artists (
    gig_id UUID NOT NULL REFERENCES artist_gigs(id) ON DELETE CASCADE,
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (gig_id, artist_id)
);

CREATE TABLE IF NOT EXISTS tour_artists (
    tour_id UUID NOT NULL REFERENCES artist_tours(id) ON DELETE CASCADE,
    artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tour_id, artist_id)
);

-- ============================================
-- Indexes
-- ============================================

-- Locations indexes
CREATE INDEX IF NOT EXISTS idx_locations_boundary ON locations USING GIST(boundary);
CREATE INDEX IF NOT EXISTS idx_locations_raw_boundary ON locations USING GIST(raw_boundary);
CREATE INDEX IF NOT EXISTS idx_locations_name_trgm ON locations USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_locations_display_name_trgm ON locations USING gin(display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_locations_importance ON locations(importance DESC);
CREATE INDEX IF NOT EXISTS idx_locations_parent_id ON locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_locations_admin_level ON locations(admin_level);

-- Place locations indexes
CREATE INDEX IF NOT EXISTS idx_place_locations_provider_place ON place_locations(provider, provider_place_id);
CREATE INDEX IF NOT EXISTS idx_place_locations_name_trgm ON place_locations USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_place_locations_formatted_trgm ON place_locations USING gin(formatted gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_place_locations_categories ON place_locations USING gin(categories);
CREATE INDEX IF NOT EXISTS idx_place_locations_is_venue ON place_locations(is_venue);
CREATE INDEX IF NOT EXISTS idx_place_locations_coordinates ON place_locations USING gist(coordinates);

-- Priority locations indexes
CREATE INDEX IF NOT EXISTS idx_priority_search_query ON priority_locations(search_query);

-- Water polygons indexes
CREATE INDEX IF NOT EXISTS idx_water_polygons_geom ON water_polygons USING GIST(geom);

-- Search cache indexes
CREATE INDEX IF NOT EXISTS idx_search_cache_keyword ON search_cache(keyword);
CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at);

-- Artists indexes
CREATE INDEX IF NOT EXISTS idx_artists_user_id ON artists(user_id);
CREATE INDEX IF NOT EXISTS idx_artists_original_coords ON artists USING GIST(original_coordinates);
CREATE INDEX IF NOT EXISTS idx_artists_active_coords ON artists USING GIST(active_coordinates);
CREATE INDEX IF NOT EXISTS idx_artists_original_display_coords ON artists USING GIST(original_display_coordinates);
CREATE INDEX IF NOT EXISTS idx_artists_active_display_coords ON artists USING GIST(active_display_coordinates);
CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_artists_romanized_name_trgm ON artists USING gin(romanized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_artists_original_city ON artists(original_city);
CREATE INDEX IF NOT EXISTS idx_artists_active_city ON artists(active_city);
CREATE INDEX IF NOT EXISTS idx_artists_original_city_id ON artists(original_city_id);
CREATE INDEX IF NOT EXISTS idx_artists_active_city_id ON artists(active_city_id);
CREATE INDEX IF NOT EXISTS idx_artists_musicbrainz_mbid ON artists(musicbrainz_mbid);
CREATE INDEX IF NOT EXISTS idx_artist_gigs_user_date ON artist_gigs(user_id, "date");
CREATE INDEX IF NOT EXISTS idx_artist_gigs_tour_id ON artist_gigs(tour_id);
CREATE INDEX IF NOT EXISTS idx_artist_gigs_city_id ON artist_gigs(city_id);
CREATE INDEX IF NOT EXISTS idx_artist_gigs_place_location_id ON artist_gigs(place_location_id);
CREATE INDEX IF NOT EXISTS idx_artist_gigs_display_coordinates ON artist_gigs USING GIST(display_coordinates);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_gigs_external_unique
ON artist_gigs(user_id, external_source, external_id)
WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artist_tours_user_name ON artist_tours(user_id, name);
CREATE INDEX IF NOT EXISTS idx_gig_artists_artist_id ON gig_artists(artist_id);
CREATE INDEX IF NOT EXISTS idx_tour_artists_artist_id ON tour_artists(artist_id);
CREATE INDEX IF NOT EXISTS idx_media_upload_events_user_created ON media_upload_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_upload_events_status ON media_upload_events(status);
CREATE INDEX IF NOT EXISTS idx_artist_media_assets_uploaded_by ON artist_media_assets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_artist_media_assets_original_uploaded_by ON artist_media_assets(original_uploaded_by);
CREATE INDEX IF NOT EXISTS idx_artist_media_asset_reviews_status ON artist_media_asset_reviews(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artist_media_asset_reviews_mbid ON artist_media_asset_reviews(musicbrainz_mbid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_media_asset_reviews_pending_user ON artist_media_asset_reviews(musicbrainz_mbid, submitted_by) WHERE status = 'pending';

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER update_artists_updated_at
    BEFORE UPDATE ON artists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_artist_media_assets_updated_at
    BEFORE UPDATE ON artist_media_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_artist_gigs_updated_at
    BEFORE UPDATE ON artist_gigs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_artist_tours_updated_at
    BEFORE UPDATE ON artist_tours
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Seed Data
-- ============================================

-- Priority locations for testing (minimal set with valid Nominatim data)
INSERT INTO priority_locations (search_query, osm_id, osm_type, name, province, country, display_name, lat, lng, rank) VALUES
    ('test', 1543125, 'relation', 'Tokyo', 'Tokyo', 'Japan', 'Tokyo, Japan', 35.6764, 139.6500, 0)
ON CONFLICT DO NOTHING;

INSERT INTO location_search_suppressions (normalized_query, suppressed_osm_id, suppressed_osm_type, reason) VALUES
    ('hongkong', 913110, 'relation', 'Prefer Hong Kong city relation 20044132 over duplicate SAR region result.'),
    ('hongkong', 10264792, 'relation', 'Prefer Hong Kong city relation 20044132 over Hong Kong Island for broad Hong Kong searches.'),
    ('香港', 913110, 'relation', 'Prefer Hong Kong city relation 20044132 over duplicate SAR region result.'),
    ('香港', 10264792, 'relation', 'Prefer Hong Kong city relation 20044132 over Hong Kong Island for broad Hong Kong searches.')
ON CONFLICT DO NOTHING;

-- Test user for testing
INSERT INTO users (id, email, role) VALUES
    ('00000000-0000-0000-0000-000000000001', 'test@test.com', 'user'),
    ('00000000-0000-0000-0000-000000000002', 'admin@test.com', 'admin')
ON CONFLICT DO NOTHING;
