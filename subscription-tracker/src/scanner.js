const { execSync } = require('child_process');
const { queries } = require('./db');
require('dotenv').config();

// Service patterns for detection
const SERVICES = {
  // Entertainment
  'Netflix': { domains: ['netflix.com'], category: 'Entertainment', keywords: ['netflix'] },
  'Spotify': { domains: ['spotify.com'], category: 'Entertainment', keywords: ['spotify'] },
  'YouTube Premium': { domains: ['youtube.com', 'google.com'], category: 'Entertainment', keywords: ['youtube premium', 'youtube music'] },
  'Disney+': { domains: ['disneyplus.com'], category: 'Entertainment', keywords: ['disney', 'disney+', 'disneyplus'] },
  'Amazon Prime': { domains: ['amazon.com', 'amazon.com.au'], category: 'Entertainment', keywords: ['prime video', 'amazon prime'] },
  'Apple TV+': { domains: ['apple.com'], category: 'Entertainment', keywords: ['apple tv'] },
  'Stan': { domains: ['stan.com.au'], category: 'Entertainment', keywords: ['stan'] },
  'Binge': { domains: ['binge.com.au'], category: 'Entertainment', keywords: ['binge'] },
  
  // Productivity
  'ChatGPT Plus': { domains: ['openai.com'], category: 'Productivity', keywords: ['chatgpt', 'openai'] },
  'Claude Pro': { domains: ['anthropic.com'], category: 'Productivity', keywords: ['claude', 'anthropic'] },
  'Notion': { domains: ['notion.so'], category: 'Productivity', keywords: ['notion'] },
  'Obsidian': { domains: ['obsidian.md'], category: 'Productivity', keywords: ['obsidian'] },
  'Todoist': { domains: ['todoist.com'], category: 'Productivity', keywords: ['todoist'] },
  'Evernote': { domains: ['evernote.com'], category: 'Productivity', keywords: ['evernote'] },
  
  // Cloud/Hosting
  'AWS': { domains: ['aws.amazon.com', 'amazonaws.com'], category: 'Cloud/Hosting', keywords: ['aws', 'amazon web services'] },
  'Google Cloud': { domains: ['cloud.google.com'], category: 'Cloud/Hosting', keywords: ['google cloud', 'gcp'] },
  'DigitalOcean': { domains: ['digitalocean.com'], category: 'Cloud/Hosting', keywords: ['digitalocean'] },
  'Vercel': { domains: ['vercel.com'], category: 'Cloud/Hosting', keywords: ['vercel'] },
  'Netlify': { domains: ['netlify.com'], category: 'Cloud/Hosting', keywords: ['netlify'] },
  'Railway': { domains: ['railway.app'], category: 'Cloud/Hosting', keywords: ['railway'] },
  'Render': { domains: ['render.com'], category: 'Cloud/Hosting', keywords: ['render'] },
  'Fly.io': { domains: ['fly.io'], category: 'Cloud/Hosting', keywords: ['fly.io', 'fly'] },
  
  // Software/Tools
  'Adobe Creative Cloud': { domains: ['adobe.com'], category: 'Software/Tools', keywords: ['adobe', 'creative cloud'] },
  'Microsoft 365': { domains: ['microsoft.com'], category: 'Software/Tools', keywords: ['microsoft 365', 'office 365'] },
  'GitHub': { domains: ['github.com'], category: 'Software/Tools', keywords: ['github'] },
  'Figma': { domains: ['figma.com'], category: 'Software/Tools', keywords: ['figma'] },
  'Canva Pro': { domains: ['canva.com'], category: 'Software/Tools', keywords: ['canva'] },
  'Grammarly': { domains: ['grammarly.com'], category: 'Software/Tools', keywords: ['grammarly'] },
  
  // Utilities
  'Google One': { domains: ['google.com'], category: 'Storage', keywords: ['google one'] },
  'Dropbox': { domains: ['dropbox.com'], category: 'Storage', keywords: ['dropbox'] },
  'iCloud': { domains: ['apple.com', 'icloud.com'], category: 'Storage', keywords: ['icloud'] },
  
  // Domains/Hosting
  'GoDaddy': { domains: ['godaddy.com'], category: 'Domains/Hosting', keywords: ['godaddy'] },
  'Namecheap': { domains: ['namecheap.com'], category: 'Domains/Hosting', keywords: ['namecheap'] },
  'Cloudflare': { domains: ['cloudflare.com'], category: 'Domains/Hosting', keywords: ['cloudflare'] },
  
  // Memberships
  'Patreon': { domains: ['patreon.com'], category: 'Memberships', keywords: ['patreon'] },
  'Substack': { domains: ['substack.com'], category: 'Memberships', keywords: ['substack'] },
  
  // Fitness
  'Peloton': { domains: ['onepeloton.com'], category: 'Fitness', keywords: ['peloton'] },
  'Strava': { domains: ['strava.com'], category: 'Fitness', keywords: ['strava'] },
  
  // Insurance
  'NRMA': { domains: ['nrma.com.au'], category: 'Insurance', keywords: ['nrma'] },
  'RACV': { domains: ['racv.com.au'], category: 'Insurance', keywords: ['racv'] },
  
  // Utilities
  'Telstra': { domains: ['telstra.com.au'], category: 'Utilities', keywords: ['telstra'] },
  'Optus': { domains: ['optus.com.au'], category: 'Utilities', keywords: ['optus'] },
  'AGL': { domains: ['agl.com.au'], category: 'Utilities', keywords: ['agl'] },
  'Origin Energy': { domains: ['originenergy.com.au'], category: 'Utilities', keywords: ['origin energy'] }
};

// Amount extraction patterns
const AMOUNT_PATTERNS = [
  /\$(\d+\.?\d*)/,  // $25.99
  /AUD?\s*(\d+\.?\d*)/i,  // AUD 25.99
  /(\d+\.?\d*)\s*AUD/i,  // 25.99 AUD
  /USD?\s*(\d+\.?\d*)/i,  // USD 25.99 (will convert)
  /amount.*?(\d+\.?\d*)/i,  // amount: 25.99
  /total.*?(\d+\.?\d*)/i,  // total: 25.99
  /charged.*?(\d+\.?\d*)/i,  // charged 25.99
  /bill.*?(\d+\.?\d*)/i  // bill: 25.99
];

// Billing frequency patterns
const FREQUENCY_PATTERNS = {
  'Monthly': /monthly|month|\/mo|per month|billed monthly/i,
  'Yearly': /yearly|annual|year|\/yr|per year|billed annually|billed yearly/i,
  'Quarterly': /quarterly|quarter|3 months/i,
  'Weekly': /weekly|week|\/wk|per week/i
};

// Date extraction patterns
const DATE_PATTERNS = [
  /next.*?bill.*?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  /renew.*?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
  /(?:on|by)\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)/i
];

// Trial detection patterns
const TRIAL_PATTERNS = [
  /free trial/i,
  /trial period/i,
  /trial ends/i,
  /\d+\s*day[s]?\s*trial/i,
  /trial.*?expir/i
];

// Cancellation detection
const CANCEL_PATTERNS = [
  /cancel.*?subscription/i,
  /subscription.*?cancel/i,
  /stop.*?billing/i,
  /end.*?subscription/i,
  /unsubscribe/i
];

// Price increase detection
const PRICE_INCREASE_PATTERNS = [
  /price.*?increas/i,
  /price.*?chang/i,
  /new.*?price/i,
  /cost.*?going up/i,
  /rate.*?increas/i
];

function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch (e) {
    return null;
  }
}

function extractAmount(text) {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      if (amount > 0 && amount < 10000) {  // Sanity check
        return amount;
      }
    }
  }
  return null;
}

function detectFrequency(text) {
  for (const [freq, pattern] of Object.entries(FREQUENCY_PATTERNS)) {
    if (pattern.test(text)) {
      return freq;
    }
  }
  return 'Monthly';  // Default assumption
}

function detectService(subject, from, body) {
  const combinedText = (subject + ' ' + from + ' ' + body).toLowerCase();
  
  for (const [serviceName, config] of Object.entries(SERVICES)) {
    // Check domain match
    const domainMatch = config.domains.some(domain => 
      from.toLowerCase().includes(domain)
    );
    
    // Check keyword match
    const keywordMatch = config.keywords.some(keyword => 
      combinedText.includes(keyword.toLowerCase())
    );
    
    if (domainMatch || keywordMatch) {
      return { name: serviceName, category: config.category };
    }
  }
  
  return { name: 'Unknown Service', category: 'Other' };
}

function detectTrialStatus(text) {
  if (TRIAL_PATTERNS.some(p => p.test(text))) {
    // Try to extract trial end date
    const dateMatch = text.match(/trial.*?end.*?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i) ||
                     text.match(/trial.*?expir.*?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
    
    if (dateMatch) {
      return { status: 'Trial', expiryDate: parseDate(dateMatch[1]) };
    }
    return { status: 'Trial', expiryDate: null };
  }
  return { status: null, expiryDate: null };
}

function isCancellationEmail(text) {
  return CANCEL_PATTERNS.some(p => p.test(text));
}

function isPriceIncreaseEmail(text) {
  return PRICE_INCREASE_PATTERNS.some(p => p.test(text));
}

function extractBillingInfo(subject, from, body, emailDate) {
  const combinedText = subject + '\n' + body;
  
  // Detect service
  const service = detectService(subject, from, body);
  
  // Extract amount
  const amount = extractAmount(combinedText);
  if (!amount) return null;  // No billing amount found
  
  // Detect frequency
  const frequency = detectFrequency(combinedText);
  
  // Extract next billing date
  let nextBillingDate = null;
  for (const pattern of DATE_PATTERNS) {
    const match = combinedText.match(pattern);
    if (match) {
      nextBillingDate = parseDate(match[1]);
      break;
    }
  }
  
  // Detect trial status
  const trial = detectTrialStatus(combinedText);
  
  // Detect cancellation
  const cancelled = isCancellationEmail(combinedText);
  
  // Detect price increase
  const priceIncrease = isPriceIncreaseEmail(combinedText);
  
  // Extract payment method (last 4 digits)
  const paymentMatch = combinedText.match(/\*+(\d{4})|ending in (\d{4})|card (\d{4})/i);
  const paymentMethod = paymentMatch ? `****${paymentMatch[1] || paymentMatch[2] || paymentMatch[3]}` : null;
  
  return {
    serviceName: service.name,
    category: service.category,
    amount,
    currency: 'AUD',  // Default to AUD, can enhance with currency detection
    frequency,
    nextBillingDate,
    paymentMethod,
    trialStatus: trial.status,
    trialExpiryDate: trial.expiryDate,
    cancelled,
    priceIncrease,
    emailDate: parseDate(emailDate)
  };
}

function scanGmail() {
  console.log('💳 Scanning Gmail for subscription emails (last 4 weeks)...');

  // Only scan last 4 weeks - email is secondary source for NEW discoveries only
  const daysBack = 28;
  const searchQuery = `newer_than:${daysBack}d (subscription OR billing OR payment OR receipt OR invoice OR charged OR recurring OR membership OR renewal)`;
  
  let result;
  try {
    result = execSync(
      `gog gmail search '${searchQuery}' --max 300 --json`,
      { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 }
    );
  } catch (error) {
    console.error('❌ Error scanning Gmail:', error.message);
    return { scanned: 0, found: 0 };
  }
  
  const data = JSON.parse(result);
  const threads = data.threads || [];

  console.log(`📬 Found ${threads.length} potential subscription emails`);

  // Get existing subscriptions and ignored providers (email only adds NEW providers)
  const existingSubscriptions = queries.getAllSubscriptions.all();
  const existingNames = new Set(existingSubscriptions.map(s => s.service_name.toLowerCase()));
  const ignoredProviders = queries.getIgnoredProviders.all().map(r => r.provider_name.toLowerCase());

  console.log(`📋 Existing: ${existingNames.size} subscriptions, ${ignoredProviders.length} ignored`);

  let subscriptionsFound = 0;
  let skippedExisting = 0;
  let skippedIgnored = 0;
  let processed = 0;

  for (const thread of threads) {
    processed++;
    if (processed % 20 === 0) {
      console.log(`Processing ${processed}/${threads.length}...`);
    }
    
    try {
      const subject = thread.subject || '';
      const from = thread.from || '';
      const date = thread.date || '';
      
      // Get snippet for quick analysis
      const body = thread.snippet || '';
      
      const billingInfo = extractBillingInfo(subject, from, body, date);
      
      if (billingInfo && billingInfo.amount) {
        const nameLower = billingInfo.serviceName.toLowerCase();

        // Skip if provider is ignored
        if (ignoredProviders.includes(nameLower)) {
          skippedIgnored++;
          continue;
        }

        // Skip if provider already exists (CSV data is gold standard)
        if (existingNames.has(nameLower)) {
          skippedExisting++;
          continue;
        }

        // Email scan only adds NEW providers not already in database
        queries.insertSubscription.run(
          billingInfo.serviceName,
          billingInfo.amount,
          billingInfo.currency,
          billingInfo.frequency,
          billingInfo.nextBillingDate,
          billingInfo.emailDate,
          billingInfo.paymentMethod,
          billingInfo.category,
          billingInfo.cancelled ? 'Cancelled' : 'Active',
          billingInfo.trialStatus,
          billingInfo.trialExpiryDate
        );

        const newSub = queries.getSubscription.get(billingInfo.serviceName, billingInfo.frequency);

        queries.insertBillingHistory.run(
          newSub.id,
          billingInfo.amount,
          billingInfo.currency,
          billingInfo.emailDate,
          subject,
          date,
          thread.id
        );

        // Mark as known now
        existingNames.add(nameLower);

        subscriptionsFound++;
        console.log(`✅ NEW: ${billingInfo.serviceName} (${billingInfo.category}): ${billingInfo.currency} ${billingInfo.amount}/${billingInfo.frequency}`);
      }
    } catch (error) {
      // Skip problematic emails
      continue;
    }
  }
  
  console.log(`\n🎉 Scan complete! Found ${subscriptionsFound} NEW subscriptions from ${threads.length} emails`);
  console.log(`   Skipped: ${skippedExisting} existing, ${skippedIgnored} ignored`);
  return { scanned: threads.length, found: subscriptionsFound, skippedExisting, skippedIgnored };
}

// Run if called directly
if (require.main === module) {
  scanGmail();
}

module.exports = { scanGmail };
