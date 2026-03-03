const { parse } = require('csv-parse/sync');

// Known subscription merchants and their clean names
const MERCHANT_MAPPINGS = {
  'spotify': { name: 'Spotify', category: 'Entertainment', domain: 'spotify.com' },
  'netflix': { name: 'Netflix', category: 'Entertainment', domain: 'netflix.com' },
  'stan.com': { name: 'Stan', category: 'Entertainment', domain: 'stan.com.au' },
  'hubbl': { name: 'Binge', category: 'Entertainment', domain: 'binge.com.au' },
  'binge': { name: 'Binge', category: 'Entertainment', domain: 'binge.com.au' },
  'disney': { name: 'Disney+', category: 'Entertainment', domain: 'disneyplus.com' },
  'paramount': { name: 'Paramount+', category: 'Entertainment', domain: 'paramountplus.com' },
  'apple.com/bill': { name: 'Apple Services', category: 'Software/Tools', domain: 'apple.com' },
  'apple.com/au': { name: 'Apple Store', category: 'Other', domain: 'apple.com' },
  'google one': { name: 'Google One', category: 'Storage', domain: 'google.com' },
  'youtubepremium': { name: 'YouTube Premium', category: 'Entertainment', domain: 'youtube.com' },
  'youtube premium': { name: 'YouTube Premium', category: 'Entertainment', domain: 'youtube.com' },
  'amznprime': { name: 'Amazon Prime', category: 'Entertainment', domain: 'amazon.com.au' },
  'amazon prime': { name: 'Amazon Prime', category: 'Entertainment', domain: 'amazon.com.au' },
  'openai': { name: 'ChatGPT Plus', category: 'Productivity', domain: 'openai.com' },
  'chatgpt': { name: 'ChatGPT Plus', category: 'Productivity', domain: 'openai.com' },
  'anthropic': { name: 'Claude Pro', category: 'Productivity', domain: 'anthropic.com' },
  'claude.ai': { name: 'Claude Pro', category: 'Productivity', domain: 'claude.ai' },
  'github': { name: 'GitHub', category: 'Software/Tools', domain: 'github.com' },
  'adobe': { name: 'Adobe Creative Cloud', category: 'Software/Tools', domain: 'adobe.com' },
  'microsoft': { name: 'Microsoft 365', category: 'Software/Tools', domain: 'microsoft.com' },
  'figma': { name: 'Figma', category: 'Software/Tools', domain: 'figma.com' },
  'notion': { name: 'Notion', category: 'Productivity', domain: 'notion.so' },
  'slack': { name: 'Slack', category: 'Productivity', domain: 'slack.com' },
  'zoom': { name: 'Zoom', category: 'Productivity', domain: 'zoom.us' },
  'canva': { name: 'Canva Pro', category: 'Software/Tools', domain: 'canva.com' },
  'dropbox': { name: 'Dropbox', category: 'Storage', domain: 'dropbox.com' },
  'xero': { name: 'Xero', category: 'Software/Tools', domain: 'xero.com' },
  'railway': { name: 'Railway', category: 'Cloud/Hosting', domain: 'railway.app' },
  'vercel': { name: 'Vercel', category: 'Cloud/Hosting', domain: 'vercel.com' },
  'supabase': { name: 'Supabase', category: 'Cloud/Hosting', domain: 'supabase.com' },
  'digitalocean': { name: 'DigitalOcean', category: 'Cloud/Hosting', domain: 'digitalocean.com' },
  'cursor': { name: 'Cursor', category: 'Software/Tools', domain: 'cursor.sh' },
  'windsurf': { name: 'Windsurf', category: 'Software/Tools', domain: 'codeium.com' },
  'optus': { name: 'Optus', category: 'Utilities', domain: 'optus.com.au' },
  'telstra': { name: 'Telstra', category: 'Utilities', domain: 'telstra.com.au' },
  'vodafone': { name: 'Vodafone', category: 'Utilities', domain: 'vodafone.com.au' },
  'aussie broadband': { name: 'Aussie Broadband', category: 'Utilities', domain: 'aussiebroadband.com.au' },
  'hbf health': { name: 'HBF Health', category: 'Insurance', domain: 'hbf.com.au' },
  'medibank': { name: 'Medibank', category: 'Insurance', domain: 'medibank.com.au' },
  'bupa': { name: 'Bupa', category: 'Insurance', domain: 'bupa.com.au' },
  'nrma': { name: 'NRMA', category: 'Insurance', domain: 'nrma.com.au' },
  'racv': { name: 'RACV', category: 'Insurance', domain: 'racv.com.au' },
  'tesla': { name: 'Tesla', category: 'Utilities', domain: 'tesla.com' },
  'uber': { name: 'Uber One', category: 'Other', domain: 'uber.com' },
  'linkedin': { name: 'LinkedIn Premium', category: 'Productivity', domain: 'linkedin.com' },
  'expressvpn': { name: 'ExpressVPN', category: 'Software/Tools', domain: 'expressvpn.com' },
  'nordvpn': { name: 'NordVPN', category: 'Software/Tools', domain: 'nordvpn.com' },
  'ventraip': { name: 'VentraIP', category: 'Domains/Hosting', domain: 'ventraip.com.au' },
  '1password': { name: '1Password', category: 'Software/Tools', domain: '1password.com' },
  'idrive': { name: 'iDrive', category: 'Storage', domain: 'idrive.com' },
  'kleenheat': { name: 'Kleenheat Gas', category: 'Utilities', domain: 'kleenheat.com.au' },
  'synergy': { name: 'Synergy', category: 'Utilities', domain: 'synergy.net.au' },
  'water corp': { name: 'Water Corp', category: 'Utilities', domain: 'watercorporation.com.au' },
  'perplexity': { name: 'Perplexity', category: 'Productivity', domain: 'perplexity.ai' },
  'aws': { name: 'AWS', category: 'Cloud/Hosting', domain: 'aws.amazon.com' },
  'google cloud': { name: 'Google Cloud', category: 'Cloud/Hosting', domain: 'cloud.google.com' },
  'netlify': { name: 'Netlify', category: 'Cloud/Hosting', domain: 'netlify.com' },
  'fly.io': { name: 'Fly.io', category: 'Cloud/Hosting', domain: 'fly.io' },
  'render': { name: 'Render', category: 'Cloud/Hosting', domain: 'render.com' },
  'godaddy': { name: 'GoDaddy', category: 'Domains/Hosting', domain: 'godaddy.com' },
  'namecheap': { name: 'Namecheap', category: 'Domains/Hosting', domain: 'namecheap.com' },
  'cloudflare': { name: 'Cloudflare', category: 'Domains/Hosting', domain: 'cloudflare.com' },
  'grammarly': { name: 'Grammarly', category: 'Software/Tools', domain: 'grammarly.com' },
  'todoist': { name: 'Todoist', category: 'Productivity', domain: 'todoist.com' },
  'evernote': { name: 'Evernote', category: 'Productivity', domain: 'evernote.com' },
  'obsidian': { name: 'Obsidian', category: 'Productivity', domain: 'obsidian.md' },
  'patreon': { name: 'Patreon', category: 'Memberships', domain: 'patreon.com' },
  'substack': { name: 'Substack', category: 'Memberships', domain: 'substack.com' },
  'peloton': { name: 'Peloton', category: 'Fitness', domain: 'onepeloton.com' },
  'strava': { name: 'Strava', category: 'Fitness', domain: 'strava.com' },
  'agl': { name: 'AGL', category: 'Utilities', domain: 'agl.com.au' },
  'origin energy': { name: 'Origin Energy', category: 'Utilities', domain: 'originenergy.com.au' },
  'icloud': { name: 'iCloud', category: 'Storage', domain: 'icloud.com' },
};

// Merchants to skip (one-time purchases, not subscriptions)
const SKIP_PATTERNS = [
  'amazon au retail',
  'amazon au marketplace',
  'amazon web services', // One-off AWS charges (not subscription pattern)
  'bunnings',
  'officeworks',
  'ple computers',
  'reebelo',
  'safewill',
  'post ',
  'australia post',
  'superchoice', // superannuation
  'bpay', // bill payments (handled separately)
  'tfr westpac', // transfers
  'osko payment', // transfers
  'withdrawal online', // transfers
  'deposit', // income
  'monthly plan fee', // bank fees
  'wesfarmers', // one-off gas refill
  'wan animate', // one-off
  'premium designer', // one-off course
  'coles',
  'woolworths',
  'aldi',
  'kmart',
  'target',
  'jb hi-fi',
  'harvey norman',
  'chemist warehouse',
  'priceline',
  'myer',
  'david jones',
];

function parseDate(dateStr) {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

function normalizeMerchantName(narrative) {
  const lower = narrative.toLowerCase();

  // Skip non-subscription transactions
  for (const skip of SKIP_PATTERNS) {
    if (lower.includes(skip)) {
      return null;
    }
  }

  // Find matching known merchant
  for (const [key, value] of Object.entries(MERCHANT_MAPPINGS)) {
    if (lower.includes(key)) {
      return { name: value.name, domain: value.domain, category: value.category };
    }
  }

  return null; // Only accept known merchants for accuracy
}

function calculateFrequency(transactions) {
  if (transactions.length < 2) {
    const amount = transactions[0].amount;
    if (amount > 100) return 'Yearly';
    return 'Monthly';
  }

  const sorted = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Filter out charges too close together (within 5 days = same billing event)
  const uniqueCharges = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const daysSincePrevious = Math.round(
      (sorted[i].date.getTime() - uniqueCharges[uniqueCharges.length - 1].date.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSincePrevious > 5) {
      uniqueCharges.push(sorted[i]);
    }
  }

  if (uniqueCharges.length < 2) {
    const amount = uniqueCharges[0].amount;
    if (amount > 100) return 'Yearly';
    return 'Monthly';
  }

  // Calculate average days between charges
  let totalDays = 0;
  for (let i = 1; i < uniqueCharges.length; i++) {
    const daysBetween = Math.round(
      (uniqueCharges[i].date.getTime() - uniqueCharges[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
    );
    totalDays += daysBetween;
  }

  const avgDays = totalDays / (uniqueCharges.length - 1);

  console.log(`[CSV] Frequency calc: ${uniqueCharges.length} unique charges, avg ${avgDays.toFixed(1)} days apart`);

  if (avgDays <= 10) return 'Weekly';
  if (avgDays <= 45) return 'Monthly';
  if (avgDays <= 100) return 'Quarterly';
  return 'Yearly';
}

function detectStatus(transactions, frequency) {
  if (transactions.length === 0) return 'Cancelled';

  const sorted = [...transactions].sort((a, b) => b.date.getTime() - a.date.getTime());
  const lastCharge = sorted[0].date;
  const daysSinceLastCharge = Math.round(
    (Date.now() - lastCharge.getTime()) / (1000 * 60 * 60 * 24)
  );

  const expectedDays = {
    'Weekly': 7,
    'Monthly': 30,
    'Quarterly': 90,
    'Yearly': 365,
  };

  const expected = expectedDays[frequency] || 30;

  if (daysSinceLastCharge > expected * 3) {
    console.log(`[CSV] Status: CANCELLED - ${daysSinceLastCharge} days since last charge (expected every ${expected} days)`);
    return 'Cancelled';
  }

  if (daysSinceLastCharge > expected * 1.5) {
    console.log(`[CSV] Status: LIKELY CANCELLED - ${daysSinceLastCharge} days since last charge`);
    return 'Likely Cancelled';
  }

  return 'Active';
}

function parseWestpacCSV(csvContent) {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`[CSV] Parsed ${records.length} rows`);

  // Extract debit transactions
  const transactions = [];

  for (const record of records) {
    const debitStr = record['Debit Amount'];
    if (!debitStr) continue;

    const amount = parseFloat(debitStr);
    if (isNaN(amount) || amount <= 0) continue;

    const dateStr = record['Date'];
    if (!dateStr) continue;

    transactions.push({
      date: parseDate(dateStr),
      narrative: record['Narrative'] || '',
      amount,
      category: record['Categories'] || '',
    });
  }

  console.log(`[CSV] Found ${transactions.length} debit transactions`);

  // Group by merchant
  const merchantGroups = new Map();

  for (const tx of transactions) {
    const merchant = normalizeMerchantName(tx.narrative);
    if (!merchant) continue;

    if (!merchantGroups.has(merchant.name)) {
      merchantGroups.set(merchant.name, {
        domain: merchant.domain,
        category: merchant.category,
        transactions: []
      });
    }
    merchantGroups.get(merchant.name).transactions.push(tx);
  }

  console.log(`[CSV] Grouped into ${merchantGroups.size} known merchants`);

  // Analyze each merchant
  const results = [];

  for (const [merchantName, data] of merchantGroups) {
    const txs = data.transactions;

    // Sort by date descending
    txs.sort((a, b) => b.date.getTime() - a.date.getTime());

    const amounts = txs.map(t => t.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    // Use most recent amount (most accurate)
    const currentAmount = txs[0].amount;

    const frequency = calculateFrequency(txs);
    const status = detectStatus(txs, frequency);
    const daysSinceLastCharge = Math.round(
      (Date.now() - txs[0].date.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Confidence based on charge count
    let confidence = 'low';
    if (txs.length >= 3) confidence = 'high';
    else if (txs.length >= 2) confidence = 'medium';

    results.push({
      merchantName,
      category: data.category,
      domain: data.domain,
      transactions: txs,
      totalAmount: amounts.reduce((a, b) => a + b, 0),
      avgAmount: currentAmount, // Use most recent amount
      frequency,
      confidence,
      lastCharge: txs[0].date,
      chargeCount: txs.length,
      status,
      daysSinceLastCharge,
    });

    console.log(`[CSV] FOUND: ${merchantName} | $${currentAmount.toFixed(2)} ${frequency} | ${txs.length} charges | ${status} | last: ${daysSinceLastCharge}d ago`);
  }

  // Sort by monthly cost descending
  results.sort((a, b) => {
    const aMonthly = a.frequency === 'Yearly' ? a.avgAmount / 12 : a.avgAmount;
    const bMonthly = b.frequency === 'Yearly' ? b.avgAmount / 12 : b.avgAmount;
    return bMonthly - aMonthly;
  });

  return results;
}

function convertToSubscriptions(groups) {
  return groups.map(group => {
    // Calculate next billing date (only for active subscriptions)
    let nextBillingDate = null;
    if (group.status === 'Active') {
      const lastCharge = group.lastCharge;
      const next = new Date(lastCharge);

      if (group.frequency === 'Monthly') {
        next.setMonth(next.getMonth() + 1);
      } else if (group.frequency === 'Yearly') {
        next.setFullYear(next.getFullYear() + 1);
      } else if (group.frequency === 'Weekly') {
        next.setDate(next.getDate() + 7);
      } else if (group.frequency === 'Quarterly') {
        next.setMonth(next.getMonth() + 3);
      }

      if (next > new Date()) {
        nextBillingDate = next.toISOString().split('T')[0];
      }
    }

    return {
      service_name: group.merchantName,
      amount: Math.round(group.avgAmount * 100) / 100,
      currency: 'AUD',
      billing_frequency: group.frequency,
      category: group.category,
      next_billing_date: nextBillingDate,
      last_billing_date: group.lastCharge.toISOString().split('T')[0],
      last_charge_date: group.lastCharge.toISOString().split('T')[0],
      confidence: group.confidence,
      charge_count: group.chargeCount,
      status: group.status,
      days_since_last_charge: group.daysSinceLastCharge,
      source: 'csv',
    };
  });
}

module.exports = { parseWestpacCSV, convertToSubscriptions };
