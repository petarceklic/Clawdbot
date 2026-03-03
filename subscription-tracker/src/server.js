const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { queries } = require('./db');
const { scanGmail } = require('./scanner');
const { generateInsights } = require('./insights');
const { parseWestpacCSV, convertToSubscriptions } = require('./csv-parser');
require('dotenv').config();

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes

// Get dashboard stats
app.get('/api/stats', (req, res) => {
  try {
    const monthlyTotal = queries.getTotalMonthlyCost.get().total || 0;
    const yearlyTotal = queries.getTotalYearlyCost.get().total || 0;
    const activeSubs = queries.getActiveSubscriptions.all();
    const upcomingBills = queries.getUpcomingBills.all();
    const trialsSoon = queries.getTrialsExpiringSoon.all();
    
    // Calculate potential savings (assume 2 months free on annual plans)
    const monthlySubs = activeSubs.filter(s => s.billing_frequency === 'Monthly');
    const potentialSavings = monthlySubs.reduce((sum, sub) => sum + (sub.amount * 2), 0);
    
    res.json({
      success: true,
      stats: {
        totalMonthly: monthlyTotal.toFixed(2),
        totalYearly: yearlyTotal.toFixed(2),
        activeCount: activeSubs.length,
        upcomingThisMonth: upcomingBills.length,
        potentialAnnualSavings: potentialSavings.toFixed(2),
        trialsExpiringSoon: trialsSoon.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all subscriptions
app.get('/api/subscriptions', (req, res) => {
  try {
    const subs = queries.getAllSubscriptions.all();
    res.json({ success: true, subscriptions: subs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get active subscriptions
app.get('/api/subscriptions/active', (req, res) => {
  try {
    const subs = queries.getActiveSubscriptions.all();
    res.json({ success: true, subscriptions: subs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get subscriptions by category
app.get('/api/subscriptions/category/:category', (req, res) => {
  try {
    const subs = queries.getSubscriptionsByCategory.all(req.params.category);
    res.json({ success: true, subscriptions: subs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search subscriptions
app.get('/api/subscriptions/search', (req, res) => {
  try {
    const query = req.query.q || '';
    const searchPattern = `%${query}%`;
    const subs = queries.searchSubscriptions.all(searchPattern, searchPattern, searchPattern);
    res.json({ success: true, subscriptions: subs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get category breakdown
app.get('/api/analytics/categories', (req, res) => {
  try {
    const breakdown = queries.getCategoryBreakdown.all();
    res.json({ success: true, categories: breakdown });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get monthly spending history
app.get('/api/analytics/spending', (req, res) => {
  try {
    const spending = queries.getMonthlySpending.all();
    res.json({ success: true, spending });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get upcoming bills
app.get('/api/upcoming', (req, res) => {
  try {
    const bills = queries.getUpcomingBills.all();
    res.json({ success: true, bills });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get smart insights
app.get('/api/insights', (req, res) => {
  try {
    const insights = generateInsights();
    res.json({ success: true, insights });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get billing history
app.get('/api/history', (req, res) => {
  try {
    const history = queries.getAllBillingHistory.all();
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get billing history for specific subscription
app.get('/api/subscriptions/:id/history', (req, res) => {
  try {
    const history = queries.getBillingHistory.all(req.params.id);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get price changes
app.get('/api/price-changes', (req, res) => {
  try {
    const changes = queries.getPriceChanges.all();
    res.json({ success: true, changes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get inactive subscriptions
app.get('/api/subscriptions/inactive', (req, res) => {
  try {
    const inactive = queries.getInactiveSubscriptions.all();
    res.json({ success: true, subscriptions: inactive });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update subscription status
app.patch('/api/subscriptions/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    queries.updateSubscriptionStatus.run(status, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger Gmail scan
app.post('/api/scan', (req, res) => {
  try {
    console.log('Starting Gmail scan...');
    const result = scanGmail();
    res.json({ success: true, result });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export to CSV
app.get('/api/export/csv', (req, res) => {
  try {
    const subs = queries.getAllSubscriptions.all();

    let csv = 'Service,Amount,Currency,Frequency,Category,Status,Next Billing,Payment Method\n';
    subs.forEach(sub => {
      csv += `"${sub.service_name}",${sub.amount},${sub.currency},${sub.billing_frequency},"${sub.category}",${sub.status},"${sub.next_billing_date || ''}","${sub.payment_method || ''}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=subscriptions.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import from bank statement CSV
app.post('/api/import/csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    console.log(`[Import] Processing file: ${req.file.originalname}`);

    const csvContent = req.file.buffer.toString('utf-8');

    // Parse CSV
    const merchantGroups = parseWestpacCSV(csvContent);
    const subscriptions = convertToSubscriptions(merchantGroups);

    console.log(`[Import] Found ${subscriptions.length} subscriptions`);

    // Get ignored providers
    const ignoredProviders = queries.getIgnoredProviders.all().map(r => r.provider_name.toLowerCase());
    console.log(`[Import] Ignored providers: ${ignoredProviders.length}`);

    // Get existing subscriptions for deduplication
    const existingSubscriptions = queries.getAllSubscriptions.all();
    const existingNames = new Set(existingSubscriptions.map(s => s.service_name.toLowerCase()));

    // Filter and save
    let saved = 0;
    let skippedIgnored = 0;
    let updated = 0;

    for (const sub of subscriptions) {
      const nameLower = sub.service_name.toLowerCase();

      // Skip if ignored
      if (ignoredProviders.includes(nameLower)) {
        console.log(`[Import] SKIP (ignored): ${sub.service_name}`);
        skippedIgnored++;
        continue;
      }

      const exists = existingNames.has(nameLower);

      try {
        queries.insertSubscriptionFull.run(
          sub.service_name,
          sub.amount,
          sub.currency,
          sub.billing_frequency,
          sub.next_billing_date,
          sub.last_billing_date,
          null, // payment_method
          sub.category,
          sub.status,
          null, // trial_status
          null, // trial_expiry_date
          sub.source,
          sub.last_charge_date,
          sub.days_since_last_charge,
          sub.confidence,
          sub.charge_count
        );

        if (exists) {
          console.log(`[Import] UPDATED: ${sub.service_name}`);
          updated++;
        } else {
          console.log(`[Import] ADDED: ${sub.service_name}`);
        }
        saved++;
      } catch (err) {
        console.error(`[Import] Error saving ${sub.service_name}:`, err);
      }
    }

    res.json({
      success: true,
      found: subscriptions.length,
      saved,
      updated,
      skippedIgnored,
    });

  } catch (error) {
    console.error('[Import] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete subscription (and add to ignored list)
app.delete('/api/subscriptions/:id', (req, res) => {
  try {
    const { id } = req.params;

    // Get the subscription first to get provider name
    const subscription = queries.getSubscriptionById.get(id);

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    // Add to ignored providers list
    queries.addIgnoredProvider.run(subscription.service_name);

    // Delete the subscription
    queries.deleteSubscription.run(id);

    console.log(`[Delete] Deleted and ignored: ${subscription.service_name}`);

    res.json({
      success: true,
      message: `Deleted and ignored: ${subscription.service_name}`
    });

  } catch (error) {
    console.error('[Delete] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Edit subscription
app.patch('/api/subscriptions/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { amount, billing_frequency, category, status } = req.body;

    // Verify subscription exists
    const subscription = queries.getSubscriptionById.get(id);
    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    // Update with provided values or keep existing
    queries.updateSubscription.run(
      amount !== undefined ? amount : subscription.amount,
      billing_frequency !== undefined ? billing_frequency : subscription.billing_frequency,
      category !== undefined ? category : subscription.category,
      status !== undefined ? status : subscription.status,
      id
    );

    const updated = queries.getSubscriptionById.get(id);

    console.log(`[Edit] Updated subscription: ${subscription.service_name}`);

    res.json({ success: true, subscription: updated });

  } catch (error) {
    console.error('[Edit] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get ignored providers list
app.get('/api/ignored', (req, res) => {
  try {
    const ignored = queries.getIgnoredProviders.all();
    res.json({ success: true, providers: ignored });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Restore an ignored provider (remove from ignore list)
app.delete('/api/ignored/:name', (req, res) => {
  try {
    const { name } = req.params;
    queries.removeIgnoredProvider.run(name);
    res.json({ success: true, message: `Removed ${name} from ignored list` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n💳 Subscription Tracker running on http://localhost:${PORT}`);
  console.log(`📧 Monitoring: ${process.env.GOG_ACCOUNT}`);
  console.log(`\n🚀 Open http://localhost:${PORT} in your browser\n`);
});
