# Last 30 Days Research Skill

Matt Van Horde's "Last 30 Days" skill - research what people are saying about any topic on Reddit and X (Twitter) over the last 30 days.

## Quick Start

Just ask your OpenClaw:

```
Please use the last 30-day skill to research challenges people are having with OpenClaw
```

Or:

```
Research the last 30 days for pain points about subscription management tools
```

## What It Does

This skill helps you find **real problems** people are discussing online by:

1. 🔍 Searching Reddit with targeted queries (problems, frustrations, complaints)
2. 🐦 Searching X/Twitter for similar pain points
3. 📊 Filtering to last 30 days only (fresh, current problems)
4. 💡 Identifying patterns and opportunities

## Perfect For

- **Entrepreneurs**: Find problems worth solving
- **Product Validation**: See if your idea addresses real pain
- **Market Research**: What are people actually complaining about?
- **Competitive Analysis**: Where are existing solutions failing?

## Example Queries

```
Research challenges with:
- "email marketing automation"
- "project management tools for remote teams"  
- "fitness tracking apps"
- "subscription billing software"
- "CRM for small businesses"
```

## What You'll Get

The agent will:
1. Generate optimized search queries for Reddit + X
2. Execute searches using web_search or browser tools
3. Extract posts/tweets with high engagement
4. Summarize common pain points and themes
5. Suggest product opportunities based on findings

## Pro Tips

✅ **Be specific**: "email marketing for e-commerce" beats "marketing"
✅ **Add context**: "for developers", "for small businesses", etc.
✅ **Look for recurring complaints**: If 10+ people mention the same issue, that's validated demand
✅ **Check engagement**: High upvotes/likes = lots of people agree with that pain point

## Behind the Scenes

The skill generates search queries like:
- `subscription management problem site:reddit.com after:2026-01-13`
- `subscription management frustrated site:reddit.com after:2026-01-13`
- `subscription management (problem OR frustrated) -filter:retweets since:2026-01-13`

This focuses on:
- **Emotional language** (frustrated, hate, problem, broken)
- **Recent discussions** (last 30 days only)
- **High-signal sources** (Reddit + X)

## Installation

Already installed! Just use it by mentioning "last 30 days skill" in your conversation with OpenClaw.

---

Built based on Matt Van Horde's Last 30 Days research methodology for finding entrepreneurial opportunities.
