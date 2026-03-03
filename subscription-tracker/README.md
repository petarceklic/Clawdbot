# 💳 Subscription Tracker

Smart subscription management dashboard that scans your Gmail, tracks your subscriptions, and provides actionable insights to save money.

## ✨ Features

### 📊 **Smart Dashboard**
- Real-time overview of all your subscriptions
- Total monthly and yearly costs at a glance
- Upcoming bills calendar
- Free trials expiring soon alerts
- Potential savings calculator

### 💡 **Intelligent Insights**
- **Annual Savings Opportunities**: Shows how much you'd save by switching to annual plans
- **Unused Subscriptions**: Detects services you haven't used in 90+ days
- **Price Increase Alerts**: Tracks when services raise their prices
- **Trial Expiry Warnings**: Alerts before free trials end and you get charged
- **Duplicate Detection**: Finds subscriptions you're paying for multiple times
- **Budget Warnings**: Notifies when spending exceeds your threshold
- **Spending Trends**: Analyzes month-over-month spending patterns
- **Family Plan Opportunities**: Suggests services where you could share costs

### 📧 **Automated Gmail Scanning**
- Scans up to 365 days of email history
- Detects subscription/billing emails automatically
- Extracts:
  - Service name
  - Billing amount
  - Currency (converts USD to AUD)
  - Billing frequency (monthly, yearly, quarterly, weekly)
  - Next billing date
  - Payment method (last 4 digits)
  - Category
  - Trial status
  - Price history

### 📈 **Analytics & Visualizations**
- Category breakdown (pie chart)
- Monthly spending trend (line chart)
- Billing history tracking
- Price change tracking
- Usage activity monitoring

### 🎯 **Smart Categorization**
Auto-categorizes subscriptions into:
- **Entertainment**: Netflix, Spotify, YouTube Premium, etc.
- **Productivity**: ChatGPT, Claude, Notion, etc.
- **Cloud/Hosting**: AWS, Vercel, Railway, etc.
- **Software/Tools**: GitHub, Figma, Adobe, etc.
- **Storage**: Google One, Dropbox, iCloud, etc.
- **Domains/Hosting**: GoDaddy, Namecheap, etc.
- **Utilities**: Phone, internet, electricity, etc.
- **Fitness**: Gym memberships, fitness apps, etc.
- **Insurance**: Health, car, home, etc.
- **Memberships**: Patreon, Substack, etc.

### 🔍 **Search & Filter**
- Search by service name or category
- Filter by category
- Filter by status (Active, Trial, Cancelled)
- Real-time filtering

### 📤 **Export**
- Export all subscriptions to CSV
- Includes all fields for analysis

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ installed
- `gog` CLI installed and authenticated with Gmail
- Gmail account with subscription emails

### Installation

```bash
cd ~/clawd/subscription-tracker
npm install
```

### Configuration

The `.env` file is already configured:

```env
PORT=3001
GOG_ACCOUNT=petarceklic@gmail.com
SCAN_DAYS_BACK=365
AUTO_REFRESH_MINUTES=60
BUDGET_WARNING_THRESHOLD=500
CURRENCY=AUD
```

### Run Initial Scan

```bash
npm run scan
```

This will scan your Gmail for the last 365 days and extract all subscriptions.

### Start the Dashboard

```bash
npm start
```

Then open: **http://localhost:3001**

## 📁 Project Structure

```
subscription-tracker/
├── src/
│   ├── server.js       # Express API server
│   ├── scanner.js      # Gmail scanning & billing extraction
│   ├── insights.js     # Smart insights generator
│   ├── db.js           # SQLite database layer
│   └── seed.js         # Sample data seeder
├── public/
│   ├── index.html      # Dashboard UI
│   └── js/
│       └── app.js      # Frontend logic & charts
├── data/
│   └── subscriptions.db # SQLite database (auto-created)
├── .env                # Configuration
└── package.json        # Dependencies
```

## 🛠️ Usage

### Manual Scan
Click the "🔄 Scan Gmail" button in the dashboard to run a fresh scan.

### View Insights
The dashboard automatically generates smart insights showing:
- Money-saving opportunities
- Unused subscriptions
- Price increases
- Expiring trials
- Budget warnings
- Spending trends

### Search & Filter
- Use the search bar to find specific subscriptions
- Filter by category or status
- Results update in real-time

### Export Data
Click "📥 Export CSV" to download all subscription data.

### Update Status
Subscriptions detected as "Active" by default. The system tracks:
- **Active**: Currently subscribed
- **Trial**: Free trial period
- **Cancelled**: Subscription ended

## 📊 API Endpoints

- `GET /api/stats` - Dashboard statistics
- `GET /api/subscriptions` - All subscriptions
- `GET /api/subscriptions/active` - Active only
- `GET /api/subscriptions/inactive` - Unused (90+ days)
- `GET /api/subscriptions/category/:category` - Filter by category
- `GET /api/subscriptions/search?q=query` - Search
- `GET /api/analytics/categories` - Category breakdown
- `GET /api/analytics/spending` - Monthly spending history
- `GET /api/insights` - Smart insights
- `GET /api/upcoming` - Upcoming bills (next 30 days)
- `GET /api/price-changes` - Price increase history
- `POST /api/scan` - Trigger Gmail scan
- `GET /api/export/csv` - Export to CSV

## 🎨 Customization

### Add More Services

Edit `src/scanner.js` and add to the `SERVICES` object:

```javascript
'Your Service': {
  domains: ['service.com'],
  category: 'Category Name',
  keywords: ['service', 'keyword']
}
```

### Adjust Budget Threshold

Change `BUDGET_WARNING_THRESHOLD` in `.env` (default: $500/month)

### Scan History Range

Change `SCAN_DAYS_BACK` in `.env` (default: 365 days)

### Auto-Refresh Interval

Change `AUTO_REFRESH_MINUTES` in `.env` (default: 60 minutes)

## 💾 Database Schema

### subscriptions
- Service details, amount, frequency, status
- Billing dates, payment method, category
- Trial information
- Activity tracking

### billing_history
- Historical billing records
- Links to email sources
- Amount and date tracking

### price_changes
- Tracks price increases/decreases
- Percent change calculations
- Change dates

### usage_activity
- Activity detection from emails
- Helps identify unused subscriptions

## 🔍 How Detection Works

1. **Email Scanning**: Searches Gmail for keywords like "subscription", "billing", "payment", "invoice"
2. **Service Detection**: Matches email domains and keywords to known services
3. **Amount Extraction**: Uses regex patterns to find dollar amounts
4. **Frequency Detection**: Identifies "monthly", "yearly", "quarterly", etc.
5. **Date Parsing**: Extracts next billing dates
6. **Categorization**: Auto-assigns categories based on service type
7. **Trial Detection**: Identifies free trial periods and expiry dates
8. **Price Tracking**: Detects when amounts change over time

## 💡 Tips for Best Results

1. **First Scan**: Let the initial scan run completely (may take 5-10 minutes)
2. **Regular Updates**: Click "Scan Gmail" weekly to catch new subscriptions
3. **Review Insights**: Check the insights panel regularly for savings opportunities
4. **Export Regularly**: Download CSV backups of your subscription data
5. **Update Status**: Mark cancelled subscriptions to keep data accurate
6. **Budget Threshold**: Adjust in .env to match your comfort level

## 🐛 Troubleshooting

**No subscriptions found?**
- Run `npm run scan` manually
- Check `gog auth list` to verify Gmail access
- Increase `SCAN_DAYS_BACK` in `.env`

**Scanner missing subscriptions?**
- Some services use unique email formats
- Add custom patterns to `src/scanner.js`
- Check if emails contain billing keywords

**Port already in use?**
- Change `PORT` in `.env`
- Or kill existing: `lsof -ti:3001 | xargs kill`

**Charts not displaying?**
- Ensure at least 2 subscriptions exist
- Check browser console for errors
- Try refreshing the page

## 🚀 Future Enhancements

- [ ] Direct carrier API integration for real-time updates
- [ ] Email notifications for insights
- [ ] Bulk cancellation tools
- [ ] Savings goal tracking
- [ ] Mobile app wrapper
- [ ] Multi-currency support improvements
- [ ] Recurring optimization suggestions
- [ ] Browser extension for quick access
- [ ] Shared family account tracking

## 📄 License

MIT

---

**Built overnight by Mia** 😏💅

Current stats from sample data:
- 19 subscriptions tracked
- $470.25/month total cost
- $5,642.99/year total cost
- Multiple categories covered
- Real insights generated
