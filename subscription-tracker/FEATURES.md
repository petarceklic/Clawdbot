# 💳 Subscription Tracker - Complete Features Guide

## 🎯 Core Features

### 1. Automated Email Scanning 📧

**What it does:**
- Scans your Gmail inbox for subscription and billing emails
- Analyzes up to 365 days of history (configurable)
- Searches for keywords: subscription, billing, payment, invoice, charged, recurring, membership, renewal

**What it extracts:**
- **Service Name**: Automatically detects Netflix, Spotify, AWS, etc.
- **Billing Amount**: Finds dollar amounts in emails
- **Currency**: Supports USD (auto-converts to AUD) and AUD
- **Billing Frequency**: Monthly, Yearly, Quarterly, or Weekly
- **Next Billing Date**: Extracts renewal/billing dates
- **Payment Method**: Captures last 4 digits of card
- **Category**: Auto-assigns category based on service
- **Trial Status**: Detects free trials and expiry dates
- **Price History**: Tracks when prices change

**Supported Services:**
- 50+ pre-configured services
- Auto-detection for most subscription services
- Easy to add custom services

### 2. Smart Dashboard 📊

**Overview Stats:**
- Total monthly cost (normalized across all frequencies)
- Total yearly cost projection
- Number of active subscriptions
- Upcoming bills this month
- Potential annual savings
- Trials expiring soon count

**Visual Analytics:**
- **Category Breakdown**: Pie chart showing spending by category
- **Spending Trend**: Line chart showing monthly spending over time
- **Color-coded categories**: Each category has its own color
- **Interactive charts**: Hover for details, click to filter

### 3. Intelligent Insights 💡

The insights engine analyzes your subscriptions and provides actionable recommendations:

#### Annual Savings Opportunities
- Identifies subscriptions on monthly plans
- Calculates savings if switched to annual (assumes 2 months free)
- Shows exact dollar amounts you could save
- Lists specific services and their potential savings

#### Unused Subscriptions
- Detects subscriptions with no activity in 90+ days
- Calculates wasted monthly spending
- Shows last detected activity date
- Prioritized by cost (highest waste first)

#### Price Increase Alerts
- Tracks historical billing amounts
- Detects when services raise prices
- Shows old vs new price and percent increase
- Helps you decide if service still provides value

#### Trial Expiry Warnings
- Alerts when free trials are ending soon (7 days)
- Shows exactly when you'll be charged
- Displays the amount you'll be billed
- Marked as "URGENT" priority

#### Duplicate Detection
- Finds services you're paying for multiple times
- Common with different billing cycles or accounts
- Shows all instances and their costs

#### Budget Warnings
- Alerts when monthly spending exceeds threshold
- Shows overage amount
- Configurable budget limit in `.env`
- Suggests which subscriptions to review

#### Spending Trends
- Analyzes month-over-month changes
- Alerts if spending increases by >10%
- Shows comparison with previous month
- Helps identify subscription creep

#### Family Plan Opportunities
- Identifies services offering family/group plans
- Suggests cost-sharing opportunities
- Lists services like Netflix, Spotify, YouTube Premium, etc.

### 4. Subscription Management 🗂️

**List View:**
- All subscriptions in detailed cards
- Color-coded categories
- Status badges (Active, Trial, Cancelled)
- Shows monthly AND yearly cost for each
- Displays next billing date
- Shows payment method
- Trial expiry warnings highlighted

**Search & Filter:**
- Real-time search by service name or category
- Filter by category dropdown
- Filter by status (Active, Trial, Cancelled)
- Results update instantly

**Sorting:**
- Default: by amount (highest first)
- Can be customized via API

### 5. Billing History 📋

**Tracks:**
- Every billing transaction detected
- Historical amounts for price tracking
- Email source for each transaction
- Date of each billing
- Links to original emails

**Use Cases:**
- Price increase detection
- Billing pattern analysis
- Historical spending review
- Dispute resolution (proof of billing)

### 6. Category System 🏷️

**Pre-configured Categories:**
- Entertainment (Netflix, Spotify, etc.)
- Productivity (ChatGPT, Notion, etc.)
- Cloud/Hosting (AWS, Vercel, etc.)
- Software/Tools (GitHub, Figma, etc.)
- Storage (Google One, Dropbox, etc.)
- Domains/Hosting (GoDaddy, Namecheap, etc.)
- Utilities (Phone, internet, electricity, etc.)
- Fitness (Gym, fitness apps, etc.)
- Insurance (Health, car, home, etc.)
- Memberships (Patreon, Substack, etc.)
- Other (uncategorized services)

**Auto-categorization:**
- Matches service to category automatically
- Based on email domain and keywords
- Can be manually overridden
- Easy to add new categories

### 7. Export & Reporting 📤

**CSV Export:**
- One-click export of all subscriptions
- Includes all fields
- Ready for Excel/Google Sheets
- Fields: Service, Amount, Currency, Frequency, Category, Status, Next Billing, Payment Method

**Use Cases:**
- Tax preparation
- Budget planning
- Expense tracking
- Financial review
- Sharing with accountant

### 8. Trial Management ⚠️

**Detection:**
- Identifies free trial emails
- Extracts trial end date
- Marks subscription as "Trial" status
- Shows trial badge on dashboard

**Warnings:**
- Alerts 7 days before trial expires
- Shows exact expiry date
- Displays amount you'll be charged
- Urgent priority in insights panel

**Prevents:**
- Forgotten trial charges
- Unwanted subscriptions
- Surprise billing

### 9. Price Change Tracking 📈

**Detection:**
- Compares current billing with historical amounts
- Calculates percent increase/decrease
- Records change date
- Stores in price_changes table

**Insights:**
- Shows all price changes in insights panel
- Alerts you to increases
- Helps you evaluate value
- Decide whether to keep or cancel

### 10. Usage Activity Tracking 📊

**Detection:**
- Looks for activity emails (login, usage, notifications)
- Records activity dates
- Links to subscriptions

**Insights:**
- Identifies subscriptions unused for 90+ days
- Shows last activity date
- Calculates wasted spending
- Suggests cancellations

### 11. Upcoming Bills Calendar 📅

**Shows:**
- All bills due in next 30 days
- Exact billing dates
- Amount to be charged
- Payment method used

**Helps:**
- Plan cash flow
- Avoid overdrafts
- Budget for large annual payments

### 12. Mobile Responsive 📱

**Features:**
- Fully responsive design
- Works on desktop, tablet, mobile
- Touch-friendly interface
- Optimized layouts for small screens
- Charts resize automatically

## 🛠️ Technical Features

### Database (SQLite)
- Four tables: subscriptions, billing_history, price_changes, usage_activity
- Foreign key relationships
- Indexed for fast queries
- Automatic timestamps
- Data persistence

### API (Express)
- RESTful endpoints
- JSON responses
- Error handling
- CORS enabled
- Modular architecture

### Frontend (Vanilla JS)
- No framework bloat
- Fast and lightweight
- Chart.js for visualizations
- Tailwind CSS for styling
- Real-time updates

### Scanner (Node.js)
- Gmail integration via `gog` CLI
- Intelligent pattern matching
- Multiple regex patterns per field
- Robust error handling
- Progress logging

### Insights Engine
- Algorithmic analysis
- Priority scoring
- Actionable recommendations
- Regular updates
- Extensible architecture

## 🎨 User Experience

### Visual Design
- Clean, modern interface
- Color-coded categories
- Status badges
- Priority indicators
- Smooth transitions
- Intuitive layouts

### Performance
- Fast loading times
- Efficient queries
- Minimal API calls
- Auto-refresh (configurable)
- Background scanning

### Accessibility
- Clear typography
- High contrast colors
- Readable text sizes
- Logical tab order
- Screen-reader friendly

## 💰 Money-Saving Features

1. **Annual Plan Recommendations**: Shows exact savings
2. **Unused Detection**: Stop paying for what you don't use
3. **Price Increase Alerts**: Reevaluate when prices rise
4. **Trial Management**: Avoid accidental charges
5. **Duplicate Detection**: Eliminate redundant subscriptions
6. **Budget Warnings**: Stay within spending limits
7. **Spending Trends**: Identify subscription creep
8. **Family Plans**: Share costs with others

## 📈 Analytics Features

1. **Category Breakdown**: See where money goes
2. **Monthly Trends**: Track spending over time
3. **Cost Projections**: Monthly to yearly conversions
4. **Historical Data**: Price change tracking
5. **Activity Patterns**: Usage-based insights
6. **Comparative Analysis**: Month-over-month changes

## 🔮 Future Enhancements

- Direct API integrations (Stripe, PayPal, etc.)
- Email notifications for insights
- Bulk cancellation tools
- Savings goals
- Shared accounts tracking
- Multi-currency improvements
- Browser extension
- Mobile app

---

**Current Stats (Sample Data):**
- 19 subscriptions tracked
- $470.25/month total
- $5,642.99/year total
- 16 upcoming bills this month
- $863.54 potential annual savings
- 1 trial expiring soon

All features are live and working! 🎉
