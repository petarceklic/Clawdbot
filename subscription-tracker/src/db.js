const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'subscriptions.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'AUD',
    billing_frequency TEXT NOT NULL,
    next_billing_date TEXT,
    last_billing_date TEXT,
    payment_method TEXT,
    category TEXT DEFAULT 'Other',
    status TEXT DEFAULT 'Active',
    trial_status TEXT,
    trial_expiry_date TEXT,
    last_activity_date TEXT,
    notes TEXT,
    source TEXT DEFAULT 'email',
    last_charge_date TEXT,
    days_since_last_charge INTEGER,
    confidence TEXT DEFAULT 'medium',
    charge_count INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(service_name, billing_frequency)
  );

  CREATE TABLE IF NOT EXISTS ignored_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_name TEXT NOT NULL UNIQUE,
    ignored_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS billing_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'AUD',
    billing_date TEXT NOT NULL,
    email_subject TEXT,
    email_date TEXT,
    email_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS price_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL,
    old_amount REAL NOT NULL,
    new_amount REAL NOT NULL,
    currency TEXT DEFAULT 'AUD',
    change_date TEXT NOT NULL,
    percent_increase REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS usage_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL,
    activity_type TEXT,
    activity_date TEXT NOT NULL,
    email_subject TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sub_service ON subscriptions(service_name);
  CREATE INDEX IF NOT EXISTS idx_sub_status ON subscriptions(status);
  CREATE INDEX IF NOT EXISTS idx_sub_category ON subscriptions(category);
  CREATE INDEX IF NOT EXISTS idx_sub_next_billing ON subscriptions(next_billing_date);
  CREATE INDEX IF NOT EXISTS idx_history_sub ON billing_history(subscription_id);
  CREATE INDEX IF NOT EXISTS idx_history_date ON billing_history(billing_date);
  CREATE INDEX IF NOT EXISTS idx_usage_sub ON usage_activity(subscription_id);
  CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_activity(activity_date);
  CREATE INDEX IF NOT EXISTS idx_ignored_provider ON ignored_providers(provider_name);
`);

// Add new columns if they don't exist (for existing databases)
try {
  db.exec(`ALTER TABLE subscriptions ADD COLUMN source TEXT DEFAULT 'email'`);
} catch (e) { /* Column already exists */ }
try {
  db.exec(`ALTER TABLE subscriptions ADD COLUMN last_charge_date TEXT`);
} catch (e) { /* Column already exists */ }
try {
  db.exec(`ALTER TABLE subscriptions ADD COLUMN days_since_last_charge INTEGER`);
} catch (e) { /* Column already exists */ }
try {
  db.exec(`ALTER TABLE subscriptions ADD COLUMN confidence TEXT DEFAULT 'medium'`);
} catch (e) { /* Column already exists */ }
try {
  db.exec(`ALTER TABLE subscriptions ADD COLUMN charge_count INTEGER DEFAULT 1`);
} catch (e) { /* Column already exists */ }

const queries = {
  // Subscriptions
  insertSubscription: db.prepare(`
    INSERT OR REPLACE INTO subscriptions
    (service_name, amount, currency, billing_frequency, next_billing_date, last_billing_date,
     payment_method, category, status, trial_status, trial_expiry_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `),

  // Extended insert with new fields (for CSV import)
  insertSubscriptionFull: db.prepare(`
    INSERT OR REPLACE INTO subscriptions
    (service_name, amount, currency, billing_frequency, next_billing_date, last_billing_date,
     payment_method, category, status, trial_status, trial_expiry_date, source,
     last_charge_date, days_since_last_charge, confidence, charge_count, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `),

  // Update subscription
  updateSubscription: db.prepare(`
    UPDATE subscriptions
    SET amount = ?, billing_frequency = ?, category = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),

  // Delete subscription
  deleteSubscription: db.prepare(`DELETE FROM subscriptions WHERE id = ?`),

  // Get subscription by ID
  getSubscriptionById: db.prepare(`SELECT * FROM subscriptions WHERE id = ?`),
  
  getSubscription: db.prepare(`
    SELECT * FROM subscriptions WHERE service_name = ? AND billing_frequency = ?
  `),
  
  getAllSubscriptions: db.prepare(`
    SELECT * FROM subscriptions ORDER BY amount DESC
  `),
  
  getActiveSubscriptions: db.prepare(`
    SELECT * FROM subscriptions WHERE status = 'Active' ORDER BY amount DESC
  `),
  
  getSubscriptionsByCategory: db.prepare(`
    SELECT * FROM subscriptions WHERE category = ? ORDER BY amount DESC
  `),
  
  updateSubscriptionStatus: db.prepare(`
    UPDATE subscriptions 
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  
  updateLastActivity: db.prepare(`
    UPDATE subscriptions 
    SET last_activity_date = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),
  
  // Billing history
  insertBillingHistory: db.prepare(`
    INSERT INTO billing_history 
    (subscription_id, amount, currency, billing_date, email_subject, email_date, email_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  
  getBillingHistory: db.prepare(`
    SELECT * FROM billing_history 
    WHERE subscription_id = ? 
    ORDER BY billing_date DESC
  `),
  
  getAllBillingHistory: db.prepare(`
    SELECT bh.*, s.service_name, s.category
    FROM billing_history bh
    JOIN subscriptions s ON bh.subscription_id = s.id
    ORDER BY bh.billing_date DESC
  `),
  
  // Price changes
  insertPriceChange: db.prepare(`
    INSERT INTO price_changes 
    (subscription_id, old_amount, new_amount, currency, change_date, percent_increase)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  
  getPriceChanges: db.prepare(`
    SELECT pc.*, s.service_name
    FROM price_changes pc
    JOIN subscriptions s ON pc.subscription_id = s.id
    ORDER BY pc.change_date DESC
  `),
  
  // Usage activity
  insertUsageActivity: db.prepare(`
    INSERT INTO usage_activity 
    (subscription_id, activity_type, activity_date, email_subject)
    VALUES (?, ?, ?, ?)
  `),
  
  getLastActivity: db.prepare(`
    SELECT MAX(activity_date) as last_activity
    FROM usage_activity
    WHERE subscription_id = ?
  `),
  
  // Analytics
  getTotalMonthlyCost: db.prepare(`
    SELECT 
      SUM(CASE 
        WHEN billing_frequency = 'Monthly' THEN amount
        WHEN billing_frequency = 'Yearly' THEN amount / 12
        WHEN billing_frequency = 'Quarterly' THEN amount / 3
        WHEN billing_frequency = 'Weekly' THEN amount * 4.33
        ELSE 0
      END) as total
    FROM subscriptions
    WHERE status = 'Active'
  `),
  
  getTotalYearlyCost: db.prepare(`
    SELECT 
      SUM(CASE 
        WHEN billing_frequency = 'Monthly' THEN amount * 12
        WHEN billing_frequency = 'Yearly' THEN amount
        WHEN billing_frequency = 'Quarterly' THEN amount * 4
        WHEN billing_frequency = 'Weekly' THEN amount * 52
        ELSE 0
      END) as total
    FROM subscriptions
    WHERE status = 'Active'
  `),
  
  getCategoryBreakdown: db.prepare(`
    SELECT 
      category,
      COUNT(*) as count,
      SUM(CASE 
        WHEN billing_frequency = 'Monthly' THEN amount
        WHEN billing_frequency = 'Yearly' THEN amount / 12
        WHEN billing_frequency = 'Quarterly' THEN amount / 3
        WHEN billing_frequency = 'Weekly' THEN amount * 4.33
        ELSE 0
      END) as monthly_total
    FROM subscriptions
    WHERE status = 'Active'
    GROUP BY category
    ORDER BY monthly_total DESC
  `),
  
  getUpcomingBills: db.prepare(`
    SELECT * FROM subscriptions
    WHERE status = 'Active' 
    AND next_billing_date IS NOT NULL
    AND date(next_billing_date) BETWEEN date('now') AND date('now', '+30 days')
    ORDER BY next_billing_date ASC
  `),
  
  getTrialsExpiringSoon: db.prepare(`
    SELECT * FROM subscriptions
    WHERE trial_status = 'Trial'
    AND trial_expiry_date IS NOT NULL
    AND date(trial_expiry_date) BETWEEN date('now') AND date('now', '+7 days')
    ORDER BY trial_expiry_date ASC
  `),
  
  getInactiveSubscriptions: db.prepare(`
    SELECT s.*, ua.last_activity
    FROM subscriptions s
    LEFT JOIN (
      SELECT subscription_id, MAX(activity_date) as last_activity
      FROM usage_activity
      GROUP BY subscription_id
    ) ua ON s.id = ua.subscription_id
    WHERE s.status = 'Active'
    AND (ua.last_activity IS NULL OR date(ua.last_activity) < date('now', '-90 days'))
    ORDER BY s.amount DESC
  `),
  
  getMonthlySpending: db.prepare(`
    SELECT 
      strftime('%Y-%m', billing_date) as month,
      SUM(amount) as total,
      COUNT(*) as transaction_count
    FROM billing_history
    WHERE billing_date >= date('now', '-12 months')
    GROUP BY month
    ORDER BY month ASC
  `),
  
  searchSubscriptions: db.prepare(`
    SELECT * FROM subscriptions
    WHERE service_name LIKE ? OR category LIKE ? OR notes LIKE ?
    ORDER BY amount DESC
  `),

  // Ignored providers
  getIgnoredProviders: db.prepare(`SELECT provider_name FROM ignored_providers`),

  addIgnoredProvider: db.prepare(`
    INSERT OR REPLACE INTO ignored_providers (provider_name, ignored_at)
    VALUES (LOWER(?), CURRENT_TIMESTAMP)
  `),

  removeIgnoredProvider: db.prepare(`DELETE FROM ignored_providers WHERE LOWER(provider_name) = LOWER(?)`),

  isProviderIgnored: db.prepare(`SELECT 1 FROM ignored_providers WHERE LOWER(provider_name) = LOWER(?)`)
};

module.exports = { db, queries };
