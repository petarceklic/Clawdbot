const { queries, db } = require('./db');

function generateInsights() {
  const insights = [];
  
  // 1. Annual savings opportunity
  const annualSavings = calculateAnnualSavings();
  if (annualSavings.totalSavings > 0) {
    insights.push({
      type: 'savings',
      priority: 'high',
      title: `Save $${annualSavings.totalSavings.toFixed(2)}/year by switching to annual billing`,
      details: annualSavings.opportunities,
      action: 'Consider switching these subscriptions to annual plans'
    });
  }
  
  // 2. Unused subscriptions
  const unusedSubs = queries.getInactiveSubscriptions.all();
  if (unusedSubs.length > 0) {
    const wastedMoney = unusedSubs.reduce((sum, sub) => {
      const monthly = getMonthlyAmount(sub.amount, sub.billing_frequency);
      return sum + monthly;
    }, 0);
    
    insights.push({
      type: 'unused',
      priority: 'high',
      title: `You haven't used these in 90+ days (Wasting $${wastedMoney.toFixed(2)}/month)`,
      details: unusedSubs.map(sub => ({
        service: sub.service_name,
        amount: `$${sub.amount}/${sub.billing_frequency}`,
        lastActivity: sub.last_activity || 'Never detected'
      })),
      action: 'Consider cancelling or pausing these subscriptions'
    });
  }
  
  // 3. Price increases
  const priceChanges = queries.getPriceChanges.all().slice(0, 5);
  if (priceChanges.length > 0) {
    insights.push({
      type: 'price_increase',
      priority: 'medium',
      title: 'Price increases detected',
      details: priceChanges.map(pc => ({
        service: pc.service_name,
        change: `$${pc.old_amount} → $${pc.new_amount} (+${pc.percent_increase}%)`,
        date: pc.change_date
      })),
      action: 'Review if these services still provide value'
    });
  }
  
  // 4. Trials expiring soon
  const expiringTrials = queries.getTrialsExpiringSoon.all();
  if (expiringTrials.length > 0) {
    insights.push({
      type: 'trial_expiring',
      priority: 'urgent',
      title: 'Free trials ending soon!',
      details: expiringTrials.map(sub => ({
        service: sub.service_name,
        expires: sub.trial_expiry_date,
        willCharge: `$${sub.amount}/${sub.billing_frequency}`
      })),
      action: 'Cancel before you get charged if you don\'t want to continue'
    });
  }
  
  // 5. Duplicate subscriptions
  const duplicates = findDuplicates();
  if (duplicates.length > 0) {
    insights.push({
      type: 'duplicates',
      priority: 'high',
      title: 'Duplicate subscriptions detected',
      details: duplicates,
      action: 'You might be paying for the same service multiple times'
    });
  }
  
  // 6. Budget warning
  const monthlyTotal = queries.getTotalMonthlyCost.get().total || 0;
  const budgetThreshold = parseFloat(process.env.BUDGET_WARNING_THRESHOLD || 500);
  if (monthlyTotal > budgetThreshold) {
    const overage = monthlyTotal - budgetThreshold;
    insights.push({
      type: 'budget_warning',
      priority: 'medium',
      title: `Monthly spending exceeds budget by $${overage.toFixed(2)}`,
      details: `Current: $${monthlyTotal.toFixed(2)}/month | Budget: $${budgetThreshold}/month`,
      action: 'Consider cutting low-value subscriptions'
    });
  }
  
  // 7. Spending trends
  const spendingTrend = analyzeSpendingTrend();
  if (spendingTrend.increasing && spendingTrend.percentChange > 10) {
    insights.push({
      type: 'spending_trend',
      priority: 'medium',
      title: `Monthly spending up ${spendingTrend.percentChange}% from last month`,
      details: `Last month: $${spendingTrend.lastMonth} | This month: $${spendingTrend.thisMonth}`,
      action: 'Review recent subscription additions'
    });
  }
  
  // 8. Family plan opportunities
  const familyPlanOpportunities = findFamilyPlanOpportunities();
  if (familyPlanOpportunities.length > 0) {
    insights.push({
      type: 'family_plans',
      priority: 'low',
      title: 'These services offer family plans you could split',
      details: familyPlanOpportunities,
      action: 'Share costs with family/friends to save money'
    });
  }
  
  return insights;
}

function calculateAnnualSavings() {
  const monthlySubs = db.prepare(`
    SELECT * FROM subscriptions 
    WHERE status = 'Active' 
    AND billing_frequency = 'Monthly'
    AND amount > 10
  `).all();
  
  const opportunities = [];
  let totalSavings = 0;
  
  for (const sub of monthlySubs) {
    // Assume 2 months free with annual (typical discount)
    const monthlyAnnualCost = sub.amount * 12;
    const typicalAnnualPrice = sub.amount * 10;  // 2 months free
    const savings = monthlyAnnualCost - typicalAnnualPrice;
    
    if (savings > 0) {
      opportunities.push({
        service: sub.service_name,
        currentCost: `$${sub.amount}/month ($${monthlyAnnualCost}/year)`,
        potentialAnnualCost: `$${typicalAnnualPrice}/year`,
        savings: `$${savings}/year`
      });
      totalSavings += savings;
    }
  }
  
  return { totalSavings, opportunities };
}

function findDuplicates() {
  const allSubs = queries.getAllSubscriptions.all();
  const duplicates = [];
  const seen = new Set();
  
  for (const sub of allSubs) {
    const key = sub.service_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) {
      duplicates.push({
        service: sub.service_name,
        amount: `$${sub.amount}/${sub.billing_frequency}`,
        status: sub.status
      });
    }
    seen.add(key);
  }
  
  return duplicates;
}

function analyzeSpendingTrend() {
  const history = queries.getMonthlySpending.all();
  
  if (history.length < 2) {
    return { increasing: false, percentChange: 0 };
  }
  
  const lastMonth = history[history.length - 2].total || 0;
  const thisMonth = history[history.length - 1].total || 0;
  
  if (lastMonth === 0) return { increasing: false, percentChange: 0 };
  
  const percentChange = ((thisMonth - lastMonth) / lastMonth * 100).toFixed(1);
  
  return {
    increasing: thisMonth > lastMonth,
    percentChange: Math.abs(parseFloat(percentChange)),
    lastMonth: lastMonth.toFixed(2),
    thisMonth: thisMonth.toFixed(2)
  };
}

function findFamilyPlanOpportunities() {
  const familyPlanServices = [
    'Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 
    'Apple TV+', 'Amazon Prime', 'Google One', 'iCloud', 'Dropbox'
  ];
  
  const activeSubs = queries.getActiveSubscriptions.all();
  const opportunities = [];
  
  for (const sub of activeSubs) {
    if (familyPlanServices.some(s => sub.service_name.includes(s))) {
      opportunities.push({
        service: sub.service_name,
        currentCost: `$${sub.amount}/${sub.billing_frequency}`,
        note: 'Offers family/group plans'
      });
    }
  }
  
  return opportunities;
}

function getMonthlyAmount(amount, frequency) {
  switch (frequency) {
    case 'Monthly': return amount;
    case 'Yearly': return amount / 12;
    case 'Quarterly': return amount / 3;
    case 'Weekly': return amount * 4.33;
    default: return 0;
  }
}

// Run if called directly
if (require.main === module) {
  const insights = generateInsights();
  console.log('\n💡 Smart Insights:\n');
  insights.forEach((insight, i) => {
    console.log(`${i + 1}. [${insight.priority.toUpperCase()}] ${insight.title}`);
    console.log(`   Action: ${insight.action}\n`);
  });
}

module.exports = { generateInsights };
