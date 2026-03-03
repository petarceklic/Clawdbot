const { queries } = require('./db');

// Seed sample subscriptions based on Petar's likely services
const sampleSubscriptions = [
  // Entertainment
  { service: 'Netflix', amount: 22.99, freq: 'Monthly', category: 'Entertainment', nextBill: '2026-02-15' },
  { service: 'Spotify', amount: 12.99, freq: 'Monthly', category: 'Entertainment', nextBill: '2026-02-10' },
  { service: 'YouTube Premium', amount: 13.99, freq: 'Monthly', category: 'Entertainment', nextBill: '2026-02-20' },
  
  // Productivity
  { service: 'ChatGPT Plus', amount: 20.00, freq: 'Monthly', category: 'Productivity', nextBill: '2026-02-01' },
  { service: 'Claude Pro', amount: 20.00, freq: 'Monthly', category: 'Productivity', nextBill: '2026-02-05' },
  { service: 'Notion', amount: 10.00, freq: 'Monthly', category: 'Productivity', nextBill: '2026-02-12' },
  
  // Cloud/Hosting
  { service: 'AWS', amount: 45.80, freq: 'Monthly', category: 'Cloud/Hosting', nextBill: '2026-02-01' },
  { service: 'Vercel', amount: 20.00, freq: 'Monthly', category: 'Cloud/Hosting', nextBill: '2026-02-08' },
  { service: 'Railway', amount: 15.00, freq: 'Monthly', category: 'Cloud/Hosting', nextBill: '2026-02-18' },
  
  // Software
  { service: 'GitHub', amount: 4.00, freq: 'Monthly', category: 'Software/Tools', nextBill: '2026-02-22' },
  { service: 'Figma', amount: 15.00, freq: 'Monthly', category: 'Software/Tools', nextBill: '2026-02-14' },
  
  // Storage
  { service: 'Google One', amount: 2.99, freq: 'Monthly', category: 'Storage', nextBill: '2026-02-26' },
  { service: 'iCloud', amount: 3.99, freq: 'Monthly', category: 'Storage', nextBill: '2026-02-03' },
  
  // Domains
  { service: 'GoDaddy', amount: 120.00, freq: 'Yearly', category: 'Domains/Hosting', nextBill: '2026-08-15' },
  { service: 'Namecheap', amount: 89.99, freq: 'Yearly', category: 'Domains/Hosting', nextBill: '2026-06-20' },
  
  // Utilities
  { service: 'Telstra', amount: 89.00, freq: 'Monthly', category: 'Utilities', nextBill: '2026-02-05' },
  { service: 'AGL', amount: 120.00, freq: 'Monthly', category: 'Utilities', nextBill: '2026-02-10' },
  
  // Memberships
  { service: 'Patreon', amount: 25.00, freq: 'Monthly', category: 'Memberships', nextBill: '2026-02-15' },
  
  // Trial
  { service: 'Grammarly', amount: 12.00, freq: 'Monthly', category: 'Software/Tools', trial: true, trialExpiry: '2026-02-03' }
];

function seedDatabase() {
  console.log('🌱 Seeding database with sample subscriptions...\n');
  
  let count = 0;
  
  for (const sub of sampleSubscriptions) {
    try {
      queries.insertSubscription.run(
        sub.service,
        sub.amount,
        'AUD',
        sub.freq,
        sub.nextBill || null,
        '2026-01-27',
        null,
        sub.category,
        'Active',
        sub.trial ? 'Trial' : null,
        sub.trialExpiry || null
      );
      
      // Add to billing history
      const inserted = queries.getSubscription.get(sub.service, sub.freq);
      queries.insertBillingHistory.run(
        inserted.id,
        sub.amount,
        'AUD',
        '2026-01-27',
        `${sub.service} subscription payment`,
        '2026-01-27',
        `seed-${count}`
      );
      
      count++;
      console.log(`✅ ${sub.service} ($${sub.amount}/${sub.freq})`);
    } catch (error) {
      // Skip duplicates
    }
  }
  
  console.log(`\n🎉 Seeded ${count} subscriptions!`);
  
  // Show totals
  const monthlyTotal = queries.getTotalMonthlyCost.get().total || 0;
  const yearlyTotal = queries.getTotalYearlyCost.get().total || 0;
  
  console.log(`\n💰 Total monthly cost: $${monthlyTotal.toFixed(2)}`);
  console.log(`💰 Total yearly cost: $${yearlyTotal.toFixed(2)}`);
}

if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
