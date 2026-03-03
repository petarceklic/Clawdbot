#!/usr/bin/env node

/**
 * Last 30 Days Research Skill
 * Searches Reddit and X (Twitter) for challenges and pain points
 */

const topic = process.argv.slice(2).join(' ');

if (!topic) {
  console.error('Usage: search-last-30-days.js <topic>');
  process.exit(1);
}

console.log(`\n🔍 Researching "${topic}" over the last 30 days...\n`);

// Calculate date range
const now = new Date();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

const redditQueries = [
  `${topic} problem site:reddit.com after:${dateStr}`,
  `${topic} frustrated site:reddit.com after:${dateStr}`,
  `${topic} challenge site:reddit.com after:${dateStr}`,
  `${topic} complaint site:reddit.com after:${dateStr}`,
  `${topic} hate site:reddit.com after:${dateStr}`,
  `${topic} issue site:reddit.com after:${dateStr}`,
];

const twitterQueries = [
  `${topic} (problem OR issue OR frustrated OR hate) -filter:retweets since:${dateStr}`,
  `${topic} (doesn't work OR broken OR buggy) -filter:retweets since:${dateStr}`,
];

console.log('📋 Search Strategy:');
console.log('─────────────────────────────────────────');
console.log('Reddit queries:');
redditQueries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
console.log('\nX (Twitter) queries:');
twitterQueries.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));

console.log('\n💡 Next Steps:');
console.log('─────────────────────────────────────────');
console.log('1. Use web_search or browser tool to run these queries');
console.log('2. Extract posts/tweets with high engagement');
console.log('3. Look for recurring themes and pain points');
console.log('4. Identify potential product opportunities');
console.log('\nTip: Focus on results with high upvotes/likes - they represent validated problems!\n');

// Output structured data for agent to use
const output = {
  topic,
  dateRange: {
    from: dateStr,
    to: now.toISOString().split('T')[0]
  },
  queries: {
    reddit: redditQueries,
    twitter: twitterQueries
  }
};

console.log('📊 Search Config (JSON):');
console.log(JSON.stringify(output, null, 2));
