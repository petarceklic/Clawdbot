-- Possum PM — Database Schema

-- Paper trades logged when Grok recommends enter_yes or enter_no
CREATE TABLE IF NOT EXISTS pm_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    timestamp_utc TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    contract_name TEXT NOT NULL,
    direction TEXT NOT NULL,          -- 'yes' or 'no'
    polymarket_price REAL,
    manifold_probability REAL,
    velocity_ratio REAL,
    grok_confidence REAL,
    grok_action TEXT,                 -- 'enter_yes', 'enter_no', 'pass'
    grok_reasoning TEXT,
    suggested_entry REAL,
    suggested_exit REAL,
    status TEXT DEFAULT 'open',       -- 'open', 'closed', 'expired', 'skipped'
    -- P&L tracking columns
    entry_price_usd REAL,            -- actual entry (polymarket_price for YES, 1-price for NO)
    notional_usd REAL,               -- capital allocated per position
    quantity REAL,                    -- shares = notional / entry_price
    current_price_usd REAL,          -- latest price for unrealised P&L
    unrealised_pnl_usd REAL,         -- (current - entry) * quantity
    realised_pnl_usd REAL,           -- set on close
    close_price_usd REAL,            -- price at close/resolution
    close_timestamp_utc TEXT         -- when closed
);

-- Every contract evaluation per run (pass or fail)
CREATE TABLE IF NOT EXISTS pm_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    timestamp_utc TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    contract_name TEXT NOT NULL,
    stage_reached INTEGER NOT NULL,   -- 1=velocity, 2=prices, 3=alert_gate, 4=grok, 5=trade
    velocity_ratio REAL,
    velocity_triggered INTEGER,       -- 0 or 1
    manifold_probability REAL,
    polymarket_price REAL,
    gap_pp REAL,                      -- gap in percentage points
    gap_triggered INTEGER,            -- 0 or 1
    alert_passed INTEGER,             -- 0 or 1
    grok_direction TEXT,
    grok_confidence REAL,
    grok_action TEXT,
    grok_reasoning TEXT,
    action_taken TEXT                  -- 'trade_logged', 'pass', 'gate_failed', 'grok_skipped'
);

-- API cost tracking (shared pattern with US/AU)
CREATE TABLE IF NOT EXISTS api_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp_utc TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0
);

-- Phase 2: GDELT article matches
-- Stores articles matched to contracts from GDELT GKG files.
-- Used for velocity ratio calculation (48h count vs 30-day baseline).
CREATE TABLE IF NOT EXISTS gdelt_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gkg_record_id TEXT,
    gkg_timestamp TEXT NOT NULL,          -- YYYYMMDDHHMMSS from GKG filename
    source_name TEXT,
    url TEXT NOT NULL,
    headline TEXT,
    contract_id TEXT NOT NULL,
    matched_keywords TEXT,                -- semicolon-separated keywords
    source_tier INTEGER DEFAULT 3,        -- 1=authoritative, 2=major news, 3=other
    avg_tone REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(url, contract_id)              -- prevent duplicate storage
);

CREATE INDEX IF NOT EXISTS idx_gdelt_articles_contract_time
    ON gdelt_articles(contract_id, gkg_timestamp);

-- Track which GKG files have been processed (avoid re-downloading)
CREATE TABLE IF NOT EXISTS gdelt_processed_files (
    filename TEXT PRIMARY KEY,            -- e.g., "20260228120000"
    processed_at TEXT NOT NULL,
    articles_found INTEGER DEFAULT 0
);
