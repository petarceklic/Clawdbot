#!/usr/bin/env node
/**
 * build-data.js
 * Converts master_events.csv → data.json for the Disruptis website.
 * Zero dependencies — uses only Node.js built-ins.
 *
 * Usage: node build-data.js path/to/master_events.csv
 * Output: data.json in the same directory as this script
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// GEOCODING LOOKUP (country → [lat, lng])
// ---------------------------------------------------------------------------
const GEO_COUNTRY = {
  "United States": [38, -97], "China": [35, 105], "India": [20, 78],
  "Iran": [32, 53], "Bangladesh": [23.7, 90.4], "United Kingdom": [54, -2],
  "Russia": [55, 60], "France": [46, 2], "European Union": [50, 10],
  "Malaysia": [4, 101.7], "Venezuela": [8, -66], "Ukraine": [49, 32],
  "Indonesia": [0, 118], "Canada": [52, -106], "Pakistan": [30, 69],
  "Australia": [-25, 134], "Panama": [9, -79.5], "Nigeria": [9, 7],
  "Philippines": [12, 122], "Cuba": [22, -80], "Germany": [51, 10],
  "Ghana": [7.5, -1.5], "Finland": [64, 26], "Yemen": [15, 44],
  "South Korea": [36, 128], "Greece": [39, 22], "Vietnam": [16, 108],
  "Spain": [40, -4], "Kenya": [-1, 37], "Turkey": [39, 35],
  "Israel": [31.5, 34.8], "Italy": [42, 12.5], "Colombia": [4, -74],
  "Mexico": [23, -102], "Saudi Arabia": [24, 45], "Morocco": [32, -5],
  "Azerbaijan": [40.4, 49.9], "Myanmar": [19, 96], "Somalia": [5, 46],
  "Libya": [27, 17], "Niger": [14, 8], "Tanzania": [-6, 35],
  "Estonia": [59, 25], "Kazakhstan": [48, 68], "Serbia": [44, 21],
  "Angola": [-12, 17], "Argentina": [-34, -64], "Iraq": [33, 44],
  "Thailand": [15, 101], "Senegal": [14.5, -14.5], "Malawi": [-13.5, 34],
  "Peru": [-10, -76], "Jamaica": [18, -77], "Kyrgyzstan": [41, 75],
  "Afghanistan": [33, 65], "Ecuador": [-2, -78], "Tuvalu": [-8, 179],
  "Colombia, Ecuador": [2, -76], "Japan": [36, 140], "Brazil": [-14, -51],
  "South Africa": [-30, 25], "Egypt": [27, 30], "Algeria": [28, 3],
  "Poland": [52, 20], "Netherlands": [52.5, 5.5], "Belgium": [50.5, 4.5],
  "Sweden": [62, 15], "Norway": [60, 8], "Denmark": [56, 10],
  "Singapore": [1.35, 103.8], "Taiwan": [23.5, 121], "Slovakia": [48.7, 19.7],
  "Moldova": [47, 29], "Sri Lanka": [7, 80], "Nepal": [28, 84],
  "Oman": [21, 57], "Qatar": [25.3, 51.2], "Bahrain": [26, 50.5],
  "Kuwait": [29.3, 47.6], "Jordan": [31, 36], "Lebanon": [33.9, 35.5],
  "Syria": [35, 38], "Sudan": [15, 30], "Ethiopia": [9, 38.7],
  "Uganda": [1, 32], "Mozambique": [-18, 35], "Zimbabwe": [-20, 30],
  "Zambia": [-15, 28], "Democratic Republic of Congo": [-4, 22],
  "Tunisia": [34, 9], "Ivory Coast": [7.5, -5.5], "Cameroon": [6, 12],
  "Benin": [9.3, 2.3], "Togo": [8, 1.2], "Niger": [14, 8],
  "Chad": [15, 19], "Mali": [17, -4], "Burkina Faso": [12, -1.5],
  "Guinea": [10, -10], "Sierra Leone": [8.5, -11.8],
};

// City-level overrides for more precise placement
const GEO_CITY = {
  "United States|Mobile": [30.7, -88.0],
  "United States|San Antonio": [29.4, -98.5],
  "United States|Miami": [25.8, -80.2],
  "United States|El Paso": [31.8, -106.4],
  "United States|Palm Beach": [26.7, -80.0],
  "United States|Washington": [38.9, -77.0],
  "United Kingdom|Devon": [50.7, -3.5],
  "United Kingdom|Holyhead": [53.3, -4.6],
  "United Kingdom|London": [51.5, -0.1],
  "France|Paris": [48.9, 2.3],
  "France|Toulouse": [43.6, 1.4],
  "France|Marseille": [43.3, 5.4],
  "Germany|Potsdam": [52.4, 13.1],
  "Germany|Nuremberg": [49.5, 11.1],
  "India|Delhi": [28.6, 77.2],
  "India|Mumbai": [19.1, 72.9],
  "India|Nashik": [20.0, 73.8],
  "India|Chennai": [13.1, 80.3],
  "Canada|Portage La Prairie": [50.0, -98.3],
  "Canada|Montreal": [45.5, -73.6],
  "Nigeria|Lagos": [6.5, 3.4],
  "Australia|Brisbane": [-27.5, 153.0],
  "Australia|Sydney": [-33.9, 151.2],
  "Bangladesh|Chattogram": [22.3, 91.8],
  "Malaysia|Port Klang": [3.0, 101.4],
  "Malaysia|Sabah": [5.3, 116.7],
  "Colombia|Santa Marta": [11.2, -74.2],
  "Colombia|Bogota": [4.7, -74.1],
  "Thailand|Phuket": [7.9, 98.4],
  "Thailand|Bangkok": [13.8, 100.5],
  "Spain|Algeciras": [36.1, -5.5],
  "Spain|Madrid": [40.4, -3.7],
  "Israel|Eilat": [29.6, 35.0],
  "Russia|Krasnodar": [45.0, 39.0],
  "Russia|Moscow": [55.8, 37.6],
  "Iran|Tehran": [35.7, 51.4],
  "China|Beijing": [39.9, 116.4],
  "China|Shanghai": [31.2, 121.5],
  "Pakistan|Turbat": [26.0, 63.1],
  "Pakistan|Karachi": [24.9, 67.0],
};

// ---------------------------------------------------------------------------
// CSV PARSER (handles quoted fields with commas)
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ---------------------------------------------------------------------------
// GEOCODE AN EVENT
// ---------------------------------------------------------------------------
function geocode(row) {
  const country = row.country || '';
  const city = row.city_town || '';

  // Try city-level first
  if (city) {
    const key = `${country}|${city}`;
    if (GEO_CITY[key]) return GEO_CITY[key].slice();
  }

  // Fall back to country
  if (GEO_COUNTRY[country]) return GEO_COUNTRY[country].slice();

  return null;
}

// ---------------------------------------------------------------------------
// SEEDED RANDOM (for deterministic jitter)
// ---------------------------------------------------------------------------
function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node build-data.js path/to/master_events.csv');
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvText);
  console.log(`Parsed ${rows.length} events from CSV`);

  // --- Geocode all events ---
  const geoEvents = [];
  const countryCount = {};

  for (const row of rows) {
    const coords = geocode(row);
    if (!coords) continue;

    const country = row.country;
    countryCount[country] = (countryCount[country] || 0) + 1;

    // Jitter if same country appears multiple times
    if (countryCount[country] > 1) {
      const seed = parseInt(row.eventid) || countryCount[country];
      coords[0] += (seededRandom(seed) - 0.5) * 6;
      coords[1] += (seededRandom(seed + 100) - 0.5) * 6;
    }

    geoEvents.push({
      id: parseInt(row.eventid) || 0,
      summary: row.final_headline || row.event_summary || '',
      country: country,
      region: row.region || '',
      severity: parseFloat(row.severity_score) || 0,
      type: row.event_type || 'other',
      commodity: row.commodity_tag || '',
      routes: row.trade_routes || '',
      port: row.port || '',
      waterway: row.waterway || '',
      lat: Math.round(coords[0] * 10) / 10,
      lng: Math.round(coords[1] * 10) / 10,
      date: row.date || '',
      firstSeenAt: row.first_seen_at || '',
    });
  }

  console.log(`Geocoded ${geoEvents.length}/${rows.length} events`);

  // --- Filter to last 7 days of data ---
  const allDates = [...new Set(geoEvents.map(e => e.date).filter(Boolean))].sort();
  const recentDates = new Set(allDates.slice(-7));
  const recentEvents = geoEvents.filter(e => recentDates.has(e.date));
  console.log(`Last 7 days (${[...recentDates].join(', ')}): ${recentEvents.length} events`);

  // --- Select ~30 events for map (diverse severity + geography) ---
  const mapEvents = selectMapEvents(recentEvents, 30);
  console.log(`Selected ${mapEvents.length} events for map display`);

  // --- Generate ticker items ---
  const ticker = generateTicker(mapEvents, 14);

  // --- Compute risk index (from all data for sparkline history) ---
  const riskIndex = computeRiskIndex(geoEvents);

  // --- Compute stats (recent events only) ---
  const stats = {
    disruptions: recentEvents.length,
    sources: 2412,
  };

  // --- Trade routes (geographic constants) ---
  const tradeRoutes = [
    { name: "Trans-Atlantic", coords: [[-74, 40], [-10, 45], [0, 50]] },
    { name: "Trans-Pacific", coords: [[-122, 37], [-160, 30], [175, 35], [140, 35]] },
    { name: "Suez Corridor", coords: [[32, 31], [35, 28], [43, 14], [50, 12]] },
    { name: "Strait of Hormuz", coords: [[53, 25], [57, 24], [60, 22]] },
    { name: "Black Sea", coords: [[29, 41], [34, 44], [37, 46]] },
    { name: "US-Canada", coords: [[-75, 43], [-90, 47], [-110, 49], [-123, 49]] },
    { name: "India-SE Asia", coords: [[78, 13], [85, 10], [95, 8], [104, 5]] },
  ];

  // --- Build output ---
  const data = {
    events: mapEvents.map(e => ({
      id: e.id, summary: e.summary, country: e.country, region: e.region,
      severity: e.severity, type: e.type, commodity: e.commodity,
      routes: e.routes, port: e.port, waterway: e.waterway,
      lat: e.lat, lng: e.lng, date: e.date,
    })),
    ticker,
    tradeRoutes,
    riskIndex,
    stats,
  };

  const outPath = path.join(__dirname, 'data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Written to ${outPath}`);
  console.log(`  Events: ${data.events.length}`);
  console.log(`  Ticker: ${data.ticker.length} items`);
  console.log(`  Risk Index: ${data.riskIndex.score} (${data.riskIndex.label})`);
  console.log(`  Total disruptions: ${data.stats.disruptions}`);
}

// ---------------------------------------------------------------------------
// SELECT MAP EVENTS (diverse severity + geography)
// ---------------------------------------------------------------------------
function selectMapEvents(events, count) {
  const selected = [];
  const seenCountries = {};

  // Sort by absolute severity descending
  const sorted = [...events].sort((a, b) => Math.abs(b.severity) - Math.abs(a.severity));

  // Tiers: pick from each severity level for diversity
  const tiers = [
    { min: -4, max: -4, target: 10 },
    { min: -3, max: -3, target: 10 },
    { min: -2, max: -2, target: 6 },
    { min: -1, max: -1, target: 4 },
  ];

  for (const tier of tiers) {
    const tierEvents = sorted.filter(e =>
      e.severity >= tier.min && e.severity <= tier.max
    );

    let added = 0;
    for (const e of tierEvents) {
      if (added >= tier.target) break;
      if (seenCountries[e.country] && seenCountries[e.country] >= 2) continue;

      seenCountries[e.country] = (seenCountries[e.country] || 0) + 1;
      selected.push(e);
      added++;
    }
  }

  return selected.slice(0, count);
}

// ---------------------------------------------------------------------------
// GENERATE TICKER
// ---------------------------------------------------------------------------
function generateTicker(events, count) {
  // Use the most severe events for ticker
  const sorted = [...events].sort((a, b) => a.severity - b.severity);
  const picked = sorted.slice(0, count);

  return picked.map(e => ({
    text: e.summary.replace(/\.$/, ''), // strip trailing period
    dot: e.severity <= -3 ? 'red' : 'orange',
    tag: simplifyTag(e.commodity),
  }));
}

function simplifyTag(commodity) {
  const map = {
    'Crude Oil': 'Oil', 'Refined Petroleum Products': 'Oil',
    'Liquid Bulk (Tanker)': 'Oil', 'LNG': 'LNG',
    'Natural Gas': 'Gas', 'Coal': 'Coal',
    'Maritime & Shipping': 'Shipping', 'Port Operations': 'Ports',
    'Road & Rail Freight': 'Freight', 'Aviation & Airports': 'Aviation',
    'Containerized General Cargo': 'Shipping',
    'Rare Earths': 'Rare Earths', 'Semiconductors': 'Semiconductors',
    'Agriculture Food Supply': 'Agriculture', 'Rice': 'Rice',
    'Livestock & Meat': 'Meat', 'Fish & Seafood': 'Fish',
    'Iron Ore': 'Iron Ore', 'Steel': 'Steel',
    'Finance & Trade Policy': 'Policy', 'General Trade Disruption': 'Trade',
    'Conflict & Security': 'Security', 'Pharmaceuticals': 'Pharma',
    'Electricity/Power': 'Energy', 'Vehicles & Automotive': 'Automotive',
    'Textiles & Apparel': 'Textiles', 'Chemicals': 'Chemicals',
    'Aluminium': 'Aluminium', 'Vegetable Oils': 'Agriculture',
    'Electronics': 'Electronics', 'Beverages': 'Trade',
  };
  return map[commodity] || 'Trade';
}

// ---------------------------------------------------------------------------
// COMPUTE RISK INDEX
// ---------------------------------------------------------------------------
function computeRiskIndex(events) {
  // Score: normalize average severity to 0-100
  const avgSev = events.reduce((sum, e) => sum + e.severity, 0) / events.length;
  const score = Math.round((-avgSev / 4) * 100);

  // Label
  let label;
  if (score >= 75) label = 'Critical Risk';
  else if (score >= 60) label = 'Elevated Risk';
  else if (score >= 40) label = 'Moderate Risk';
  else label = 'Low Risk';

  // Sparkline: group events by date, compute daily average severity
  const byDate = {};
  for (const e of events) {
    if (!e.date) continue;
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e.severity);
  }

  const dates = Object.keys(byDate).sort();
  // Take last 14 dates for sparkline
  const recentDates = dates.slice(-14);
  const sparkline = recentDates.map(d => {
    const sevs = byDate[d];
    const avg = sevs.reduce((s, v) => s + v, 0) / sevs.length;
    return Math.round((-avg / 4) * 100);
  });

  // Pad to 14 points if fewer dates
  while (sparkline.length < 14) sparkline.unshift(sparkline[0] || score);

  // Change from yesterday
  const change = sparkline.length >= 2
    ? Math.round((sparkline[sparkline.length - 1] - sparkline[sparkline.length - 2]) * 10) / 10
    : 0;

  const trend = change >= 0 ? 'up' : 'down';

  return { score, label, sparkline, change: Math.abs(change), trend };
}

main();
