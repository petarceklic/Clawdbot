# 🚀 Quick Setup Guide

## Step 1: Open Terminal

Navigate to the subscription-tracker folder:

```bash
cd ~/clawd/subscription-tracker
```

## Step 2: Install Dependencies (if needed)

```bash
npm install
```

## Step 3: Run Initial Scan

Scan your Gmail for subscriptions:

```bash
npm run scan
```

This will take a few minutes as it analyzes up to 365 days of email history.

## Step 4: Start the Dashboard

```bash
npm start
```

## Step 5: Open the Dashboard

Once the server starts, open your browser to:

**http://localhost:3001**

## That's It! 🎉

The dashboard will show:
- 💰 Total monthly and yearly costs
- 📊 Spending breakdown by category
- 💡 Smart insights for saving money
- 📅 Upcoming bills
- ⚠️ Trials expiring soon
- 📈 Spending trends over time

---

## Manual Commands

### Scan Gmail for new subscriptions
```bash
npm run scan
```

### Start the server
```bash
npm start
```

### Seed sample data (for testing)
```bash
node src/seed.js
```

### Generate insights (CLI)
```bash
node src/insights.js
```

---

## Configuration

Edit `.env` to customize:

```env
PORT=3001                      # Server port
GOG_ACCOUNT=your@email.com    # Gmail account
SCAN_DAYS_BACK=365             # How far back to scan
AUTO_REFRESH_MINUTES=60        # Dashboard refresh interval
BUDGET_WARNING_THRESHOLD=500   # Monthly budget alert
CURRENCY=AUD                   # Default currency
```

---

## Troubleshooting

**"gog is not installed"**
```bash
brew install steipete/tap/gogcli
```

**"gog is not authenticated"**
```bash
gog auth add your@email.com --services gmail
```

**"Port 3001 already in use"**

Edit `.env` and change `PORT=3001` to a different port.

**Scanner not finding subscriptions?**

- Check that billing emails exist in your Gmail
- Increase `SCAN_DAYS_BACK` in `.env`
- Some services may need custom patterns added to `src/scanner.js`

---

**Need help?** Check the main README.md for full documentation.
