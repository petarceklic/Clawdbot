const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3002;
const PROJECTS_FILE = path.join(__dirname, '../projects.md');
const SESSIONS_DIR = path.join(os.homedir(), '.clawdbot/agents/main/sessions');
const CRON_FILE = path.join(os.homedir(), '.clawdbot/cron/jobs.json');
const BRAVE_COUNTER = path.join(__dirname, 'brave-usage.json');
const COMPETITION_JSON = path.join(__dirname, '../trading-bot-possum/interface/competition.json');

// ── Shared nav component ────────────────────────────────────────────────
// Single source of truth for the nav bar across all pages.
// activePage: 'au' | 'us' | 'crypto' | 'pm' | 'leaderboard' | 'schedule'
// statusLabel: text for the status pill (e.g. 'PAPER mode', 'Auto-refresh 30s')
function buildNavHtml(activePage, statusLabel) {
  const links = [
    { href: '/possum-au',    label: '🦘 Possum AU',    key: 'au',          color: '#34d399' },
    { href: '/possum-us',    label: '🇺🇸 Possum US',    key: 'us',          color: '#3b82f6' },
    { href: '/possum-crypto',label: '₿ Crypto',        key: 'crypto',      color: '#f59e0b' },
    { href: '/possum-pm',    label: '🎯 Possum PM',    key: 'pm',          color: '#a78bfa' },
    { href: '/leaderboard',  label: '🏆 Leaderboard',  key: 'leaderboard', color: '#fbbf24' },
    { href: '/schedule',     label: '📅 Schedule',     key: 'schedule',    color: '#fb923c' },
  ];
  const refreshHref = links.find(l => l.key === activePage)?.href || '/';
  return '<div class="header-right">\n'
    + `  <div class="live"><div class="dot-pulse"></div> ${statusLabel}</div>\n`
    + '  <a href="/" class="btn">← War Room</a>\n'
    + links.map(l => {
        const active = l.key === activePage ? `;background:${l.color}15` : '';
        return `  <a href="${l.href}" class="btn" style="color:${l.color};border-color:${l.color}40${active}">${l.label}</a>`;
      }).join('\n') + '\n'
    + `  <a href="${refreshHref}" class="btn" style="color:#999;border-color:#99999940" title="Refresh">↻</a>\n`
    + '</div>';
}

// Format YYYY-MM-DD → DD/MM/YYYY (Australian date format)
function fmtDateAU(d) {
  if (!d || typeof d !== 'string') return '—';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}
// Format YYYY-MM-DD → DD/MM for short chart labels
function fmtDateShort(d) {
  if (!d || typeof d !== 'string') return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : d;
}
// Format ISO timestamp → DD/MM/YYYY HH:MM
function fmtTsAU(ts) {
  if (!ts) return '—';
  return fmtDateAU(ts.slice(0, 10)) + ' ' + (ts.slice(11, 16) || '');
}

function isCompetitionActive() {
  try {
    const comp = JSON.parse(fs.readFileSync(COMPETITION_JSON, 'utf8')).competition;
    const today = new Date().toISOString().slice(0, 10);
    return today >= comp.start_date && today <= comp.end_date;
  } catch { return false; }
}

function getCompetitionStartDate() {
  try {
    return JSON.parse(fs.readFileSync(COMPETITION_JSON, 'utf8')).competition.start_date;
  } catch { return '2026-03-02'; }
}

// ── Market Overview (shared across all pages) ────────────────────────────────
const MARKET_CSS = `
  .mkt-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
  .mkt-card { background: var(--surface, #13131f); border: 1px solid var(--border2, #ffffff13); border-radius: var(--r, 10px); padding: 12px 14px; }
  .mkt-name { font-size: 0.6rem; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--muted, #64647a); margin-bottom: 2px; }
  .mkt-price { font-size: 1.15rem; font-weight: 800; letter-spacing: -0.5px; }
  .mkt-change { font-size: 0.7rem; font-weight: 600; margin-bottom: 2px; }
  .mkt-spark { width: 100%; height: 36px; max-height: 36px; display: block; }
  .pm-contracts { list-style: none; padding: 0; margin: 0; }
  .pm-contracts li { display: flex; align-items: center; font-size: 0.68rem; padding: 4px 0; border-bottom: 1px solid var(--border, #ffffff09); }
  .pm-contracts li:last-child { border-bottom: none; }
  .pm-bar { height: 4px; border-radius: 2px; background: var(--surface3, #191926); flex: 1; margin: 0 8px; min-width: 30px; }
  .pm-bar-fill { height: 100%; border-radius: 2px; background: #14b8a6; }
  .mkt-grid-pm { grid-template-columns: 1fr; max-width: 340px; }
  @media (max-width: 700px) { .mkt-grid { grid-template-columns: 1fr; } }
`;

const MARKET_SPARKLINE_SCRIPT = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script>
document.querySelectorAll('.mkt-spark').forEach(function(canvas) {
  try {
    var values = JSON.parse(canvas.dataset.values || '[]');
    var color = canvas.dataset.color || '#10b981';
    if (!values.length) return;
    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: values.map(function(_, i) { return i; }),
        datasets: [{
          data: values,
          borderColor: color,
          borderWidth: 1.5,
          pointRadius: 0,
          fill: { target: 'origin', above: color + '12', below: color + '12' },
          tension: 0.15,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        elements: { line: { borderJoinStyle: 'round' } },
      }
    });
  } catch(e) {}
});
</script>
`;

/**
 * Build market overview HTML.
 * @param {object} markets  - API response from /api/markets
 * @param {string} filter   - 'all' (leaderboard: 3 indices), 'asx200', 'sp500', 'btc', 'pm'
 */
function buildMarketOverviewHtml(markets, filter = 'all') {
  if (!markets) return '';
  const allIndices = markets.indices || [];
  const poly = markets.polymarket || [];

  function fmtMktPrice(v, key) {
    if (v == null || v === 0) return '—';
    if (key === 'btc') return '$' + Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return Number(v).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  // Filter indices
  const indices = filter === 'all' ? allIndices
    : filter === 'pm' ? []
    : allIndices.filter(idx => idx.key === filter);

  // Individual bot pages: show 3 side-by-side cards (24H, 7D, 30D) for that index
  const isSingleIndex = filter !== 'all' && filter !== 'pm';

  // ASX market open/closed status (Mon-Fri 10:00-16:00 AEST)
  function isAsxOpen() {
    const now = new Date();
    const aest = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
    const day = aest.getDay();
    const h = aest.getHours(), m = aest.getMinutes();
    if (day === 0 || day === 6) return false;
    const mins = h * 60 + m;
    return mins >= 600 && mins < 960; // 10:00 - 16:00
  }

  function buildCard(label, chg, sparkData, sparkColor, extra) {
    const chgColor = chg >= 0 ? '#10b981' : '#ef4444';
    const chgStr = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    const canvasId = 'spark' + Math.random().toString(36).slice(2, 8);
    return `<div class="mkt-card">
      <div class="mkt-name">${label}</div>
      ${extra || ''}
      <div class="mkt-change" style="color:${chgColor}">${chgStr}</div>
      <canvas id="${canvasId}" class="mkt-spark" height="36" data-values='${sparkData}' data-color='${sparkColor}'></canvas>
    </div>`;
  }

  let indexCards = '';

  if (isSingleIndex && indices.length === 1) {
    // Bot page: 3 cards side-by-side for 24H, 7D, 30D
    const idx = indices[0];
    const sparklines = idx.sparklines || {};
    const mktStatus = (idx.key === 'asx200')
      ? (isAsxOpen()
        ? ' <span style="font-size:0.55rem;font-weight:700;color:#10b981;background:#10b98118;padding:1px 6px;border-radius:4px;margin-left:6px">OPEN</span>'
        : ' <span style="font-size:0.55rem;font-weight:700;color:#64647a;background:#64647a18;padding:1px 6px;border-radius:4px;margin-left:6px">CLOSED</span>')
      : '';
    const priceHtml = `<div class="mkt-price">${fmtMktPrice(idx.current, idx.key)}</div>`;

    const timeframes = [
      { key: '24h', label: `${idx.name} · 24H${mktStatus}` },
      { key: '7d',  label: `${idx.name} · 7D` },
      { key: '30d', label: `${idx.name} · 30D` },
    ];

    indexCards = timeframes.map((tf, i) => {
      const tfData = sparklines[tf.key] || {};
      const chg = tfData.change_pct || 0;
      const sparkData = JSON.stringify(tfData.data || []);
      const sparkColor = chg >= 0 ? '#10b981' : '#ef4444';
      // Show price only on the first card
      return buildCard(tf.label, chg, sparkData, sparkColor, i === 0 ? priceHtml : '');
    }).join('');
  } else {
    // Leaderboard: one card per index, 7d sparkline
    indexCards = indices.map((idx, i) => {
      const sparklines = idx.sparklines || {};
      const tfData = sparklines['7d'] || {};
      const chg = tfData.change_pct || 0;
      const sparkData = JSON.stringify(tfData.data || []);
      const sparkColor = chg >= 0 ? '#10b981' : '#ef4444';
      const priceHtml = `<div class="mkt-price">${fmtMktPrice(idx.current, idx.key)}</div>`;
      return buildCard((idx.name || idx.key) + ' · 7D', chg, sparkData, sparkColor, priceHtml);
    }).join('');
  }

  // Polymarket card only on PM page
  const pmCard = (filter === 'pm') && poly.length > 0 ? `<div class="mkt-card">
    <div class="mkt-name">Polymarket</div>
    <ul class="pm-contracts">
      ${poly.map(c => {
        const pct = c.yes_price != null ? Math.round(c.yes_price * 100) : null;
        const name = (c.name || c.slug || '').replace(/^(US |Will the US )/, '').slice(0, 28);
        return `<li>
          <span style="color:var(--text);flex-shrink:0;max-width:55%">${name}</span>
          <div class="pm-bar"><div class="pm-bar-fill" style="width:${pct ?? 0}%"></div></div>
          <span style="color:#14b8a6;font-weight:700;flex-shrink:0">${pct != null ? pct + '¢' : '—'}</span>
        </li>`;
      }).join('')}
    </ul>
  </div>` : '';

  if (!indexCards && !pmCard) return '';
  const gridClass = pmCard ? 'mkt-grid mkt-grid-pm' : 'mkt-grid';
  return `<div class="${gridClass}">${indexCards}${pmCard}</div>`;
}

// ── Data: Claude usage from session files ─────────────────────────────────────
const CONTEXT_WINDOW = 1000000; // claude-sonnet-4-6 (1M token context)

function fmtTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'K';
  return String(n);
}

function getClaudeUsage() {
  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const weekStart = new Date(Date.now() - 7 * 86400000);

    let totalTokens = 0, todayTokens = 0, weekTokens = 0;
    let totalMessages = 0, todayMessages = 0;
    let latestContextTokens = 0, latestTs = 0;

    for (const file of files) {
      const filePath = path.join(SESSIONS_DIR, file);
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type === 'message' && entry.message?.role === 'assistant' && entry.message?.usage) {
            const u = entry.message.usage;
            const tokens = (u.input || 0) + (u.output || 0);
            const ts = new Date(entry.timestamp);
            const tsMs = ts.getTime();
            totalTokens += tokens;
            totalMessages++;
            if (ts >= todayStart) { todayTokens += tokens; todayMessages++; }
            if (ts >= weekStart) { weekTokens += tokens; }
            // Track latest message context size (cache = current context window usage)
            if (tsMs > latestTs) {
              latestTs = tsMs;
              latestContextTokens = (u.cacheRead || 0) + (u.cacheWrite || 0) + (u.input || 0);
            }
          }
        } catch {}
      }
    }

    const contextPct = Math.min(100, Math.round((latestContextTokens / CONTEXT_WINDOW) * 100));

    return {
      todayTokens: fmtTokens(todayTokens),
      weekTokens: fmtTokens(weekTokens),
      totalTokens: fmtTokens(totalTokens),
      contextPct,
      contextTokens: Math.round(latestContextTokens / 1000) + 'K',
      totalMessages,
      todayMessages,
    };
  } catch (e) {
    return { todayTokens: 'N/A', weekTokens: 'N/A', totalTokens: 'N/A', contextPct: 0, contextTokens: '?', totalMessages: 0, todayMessages: 0 };
  }
}

// ── Data: Brave search usage (parsed from session files) ─────────────────────
function getBraveUsage() {
  try {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'));
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    let today = 0, total = 0;
    for (const file of files) {
      const lines = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          // Look for web_search tool calls
          if (entry.type === 'message' && Array.isArray(entry.message?.content)) {
            for (const block of entry.message.content) {
              if (block.type === 'toolCall' && block.name === 'web_search') {
                total++;
                if (new Date(entry.timestamp) >= todayStart) today++;
              }
            }
          }
        } catch {}
      }
    }
    return { today, total };
  } catch { return { today: 0, total: 0 }; }
}

// ── Data: Cron jobs ───────────────────────────────────────────────────────────
function getCronJobs() {
  try {
    const raw = JSON.parse(fs.readFileSync(CRON_FILE, 'utf-8'));
    const jobs = Array.isArray(raw) ? raw : (raw[1] || Object.values(raw).find(Array.isArray) || []);
    return jobs.map(j => ({
      name: j.name || 'Unnamed',
      enabled: j.enabled,
      schedule: j.schedule?.expr || '',
      lastRun: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toLocaleString('en-AU', { timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : null,
      nextRun: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toLocaleString('en-AU', { timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : null,
      lastStatus: j.state?.lastStatus || null,
    }));
  } catch { return []; }
}

// ── Data: Projects ────────────────────────────────────────────────────────────
function parseProjects(md) {
  const sections = {};
  let currentSection = null, currentProject = null;
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) { currentSection = line.replace('## ', '').trim(); sections[currentSection] = []; currentProject = null; continue; }
    if (line.startsWith('### ') && currentSection) { currentProject = { name: line.replace('### ', '').trim(), details: {} }; sections[currentSection].push(currentProject); continue; }
    if (line.startsWith('- **') && currentProject) {
      const match = line.match(/^- \*\*(.+?)(?::)?\*\*:?\s*(.*)$/);
      if (match) { const key = match[1].toLowerCase().replace(/\s+/g,'_').replace(/[^a-z_]/g,''); currentProject.details[key] = match[2].trim(); }
    }
  }
  return sections;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    'shipped':     ['#10b981', '#10b98115'],
    'in-progress': ['#f59e0b', '#f59e0b15'],
    'active':      ['#60a5fa', '#60a5fa15'],
    'on-hold':     ['#6b7280', '#6b728015'],
    'idea':        ['#a78bfa', '#a78bfa15'],
  };
  const s = map[status?.toLowerCase()] || ['#6b7280', '#6b728015'];
  const label = status ? status.replace(/-/g, ' ').toUpperCase() : '—';
  return `<span class="badge" style="color:${s[0]};background:${s[1]};border-color:${s[0]}30">${label}</span>`;
}

function renderCard(p) {
  const d = p.details;
  const explored = d.explored === 'yes';
  const stack = d.stack ? `<div class="tags">${d.stack.split(',').map(t=>`<span class="tag">${t.trim()}</span>`).join('')}</div>` : '';
  const notes = d.notes ? `<p class="card-notes">${d.notes}</p>` : '';
  const url = d.url ? `<a href="${d.url}" class="card-link" target="_blank">${d.url}</a>` : '';
  const type = d.type ? `<div class="card-type">${d.type}</div>` : '';
  const exploredBadge = explored ? `<span class="explored-badge">💬 Explored</span>` : '';
  return `<div class="card${explored ? ' card-explored' : ''}">${type}<div class="card-header"><h3 class="card-title">${p.name}</h3><div class="badge-group">${statusBadge(d.status)}${exploredBadge}</div></div>${notes}${stack}${url}</div>`;
}

// ── Route ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const md = fs.existsSync(PROJECTS_FILE) ? fs.readFileSync(PROJECTS_FILE, 'utf-8') : '';
  const sections = parseProjects(md);
  const claude = getClaudeUsage();
  const brave = getBraveUsage();
  const crons = getCronJobs();
  const lastMod = fs.existsSync(PROJECTS_FILE)
    ? new Date(fs.statSync(PROJECTS_FILE).mtime).toLocaleString('en-AU', { timeZone: 'Australia/Perth', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
    : '—';

  // Count projects by status
  let activeCount = 0, ideasCount = 0, shippedCount = 0;
  for (const [title, projects] of Object.entries(sections)) {
    if (title.includes('SaaS Ideas')) continue;
    for (const p of projects) {
      const s = p.details?.status?.toLowerCase();
      if (s === 'shipped') shippedCount++;
      else if (s === 'in-progress' || s === 'active' || s === 'active (skill)') activeCount++;
      else ideasCount++;
    }
  }
  ideasCount += getIdeas().length;

  // Sections HTML (skip SaaS Ideas — rendered separately as table)
  let sectionsHTML = '';
  for (const [title, projects] of Object.entries(sections)) {
    if (!projects.length) continue;
    if (title.includes('SaaS Ideas')) continue;
    sectionsHTML += `<section class="section"><h2 class="section-title">${title}</h2><div class="cards-grid">${projects.map(renderCard).join('')}</div></section>`;
  }

  // Ideas table HTML
  const ideas = getIdeas().sort((a, b) => new Date(b.date) - new Date(a.date));
  const statusColor = { idea: '#a78bfa', explored: '#7c6ff7', validated: '#f59e0b', building: '#3b82f6', shipped: '#10b981' };
  const ideasHTML = ideas.map(i => {
    const sc = statusColor[i.status] || '#6b7280';
    const exploredBadge = i.explored ? `<span class="i-exp">💬</span>` : '';
    const tags = (i.tags||[]).slice(0,3).map(t=>`<span class="i-tag">${t}</span>`).join('');
    return `<tr>
      <td class="i-name">${i.name}${exploredBadge}</td>
      <td><span class="i-type">${i.type||'—'}</span></td>
      <td><span class="i-status" style="background:${sc}18;color:${sc};border-color:${sc}35">${i.status}</span></td>
      <td class="i-date">${fmtDateAU(i.date)||'—'}</td>
      <td class="i-summary">${i.summary?.slice(0,120)}${i.summary?.length>120?'…':''}</td>
      <td>${tags}</td>
    </tr>`;
  }).join('');

  // Cron HTML
  const cronHTML = crons.length ? crons.map(j => `
    <div class="cron-item">
      <div class="cron-dot" style="background:${j.enabled ? '#10b981' : '#6b7280'}"></div>
      <div class="cron-info">
        <div class="cron-name">${j.name}</div>
        <div class="cron-meta">
          ${j.lastRun ? `<span>Last: ${j.lastRun}</span>` : ''}
          ${j.nextRun ? `<span>Next: ${j.nextRun}</span>` : ''}
        </div>
      </div>
      ${j.lastStatus ? `<span class="cron-status" style="color:${j.lastStatus==='ok'?'#10b981':'#ef4444'}">${j.lastStatus}</span>` : ''}
    </div>`).join('') : '<div class="empty">No cron jobs</div>';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>War Room</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070711;
      --surface: #0f0f1a;
      --surface2: #13131f;
      --surface3: #191926;
      --border: #ffffff09;
      --border2: #ffffff13;
      --text: #e2e2ee;
      --muted: #64647a;
      --dim: #2a2a3a;
      --accent: #7c6ff7;
      --accent2: #a78bfa;
      --green: #10b981;
      --amber: #f59e0b;
      --blue: #60a5fa;
      --r: 10px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none;
      z-index: 0;
    }
    .app { position: relative; z-index: 1; display: grid; grid-template-rows: auto 1fr; min-height: 100vh; }

    /* ── Header ── */
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px;
      border-bottom: 1px solid var(--border2);
      background: #07071180;
      backdrop-filter: blur(12px);
      position: sticky; top: 0; z-index: 100;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-mark {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      box-shadow: 0 0 20px #7c6ff730;
    }
    .logo-name { font-size: 0.95rem; font-weight: 700; letter-spacing: -0.3px; }
    .logo-name em { color: var(--accent2); font-style: normal; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .live { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; color: var(--muted); }
    .dot-pulse { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
    .btn-refresh {
      font-family: inherit; font-size: 0.72rem; color: var(--muted);
      background: var(--surface); border: 1px solid var(--border2);
      padding: 5px 12px; border-radius: 6px; cursor: pointer; text-decoration: none;
      transition: all .15s;
    }
    .btn-refresh:hover { background: var(--surface2); color: var(--text); }
    .btn-ideas { font-family: inherit; font-size: 0.72rem; color: var(--accent2); background: #7c6ff710; border: 1px solid #7c6ff730; padding: 5px 12px; border-radius: 6px; cursor: pointer; text-decoration: none; transition: all .15s; }
    .btn-ideas:hover { background: #7c6ff720; color: var(--accent2); }

    /* ── Layout ── */
    .layout { display: grid; grid-template-columns: 1fr 280px; gap: 0; }
    .main { padding: 28px; border-right: 1px solid var(--border); overflow-auto; }
    .sidebar { padding: 24px 20px; }

    /* ── Stats Bar ── */
    .stats-bar {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 12px; margin-bottom: 32px;
    }
    .stat-card {
      background: var(--surface);
      border: 1px solid var(--border2);
      border-radius: var(--r);
      padding: 16px;
      position: relative; overflow: hidden;
      transition: transform .2s, border-color .2s;
    }
    .stat-card:hover { transform: translateY(-1px); border-color: var(--border2); }
    .stat-card::before {
      content: ''; position: absolute; inset: 0;
      background: var(--glow, transparent);
      opacity: .07; pointer-events: none;
    }
    .stat-card[data-color="green"] { --glow: var(--green); }
    .stat-card[data-color="purple"] { --glow: var(--accent); }
    .stat-card[data-color="amber"] { --glow: var(--amber); }
    .stat-card[data-color="blue"] { --glow: var(--blue); }
    .stat-label { font-size: 0.68rem; font-weight: 500; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 8px; }
    .stat-value { font-size: 1.5rem; font-weight: 700; line-height: 1; letter-spacing: -0.5px; }
    .stat-value.green { color: var(--green); }
    .stat-value.purple { color: var(--accent2); }
    .stat-value.amber { color: var(--amber); }
    .stat-value.blue { color: var(--blue); }
    .stat-sub { font-size: 0.7rem; color: var(--muted); margin-top: 5px; }
    .stat-icon { position: absolute; top: 12px; right: 14px; font-size: 1.1rem; opacity: .4; }

    /* ── Section ── */
    .section { margin-bottom: 36px; }
    .section-title {
      font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .12em; color: var(--muted); margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

    /* ── Cards ── */
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r); padding: 16px;
      transition: all .2s; position: relative; overflow: hidden;
    }
    .card::before {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(135deg, #7c6ff710, transparent 60%);
      opacity: 0; transition: opacity .2s;
    }
    .card:hover { border-color: var(--border2); transform: translateY(-2px); box-shadow: 0 8px 28px #00000035; }
    .card:hover::before { opacity: 1; }
    .card-explored { border-color: #7c6ff730; box-shadow: 0 0 0 1px #7c6ff720, inset 0 0 40px #7c6ff708; }
    .card-explored:hover { border-color: #7c6ff760; box-shadow: 0 8px 28px #00000035, 0 0 0 1px #7c6ff740; }
    .card-type { font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
    .badge-group { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
    .explored-badge { font-size: 0.6rem; font-weight: 600; color: var(--accent2); background: #a78bfa15; border: 1px solid #a78bfa30; padding: 2px 7px; border-radius: 99px; white-space: nowrap; }
    .ideas-table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--border2); }
    .ideas-table { width: 100%; border-collapse: collapse; background: var(--surface); font-size: 0.8rem; }
    .ideas-table thead tr { border-bottom: 1px solid var(--border2); }
    .ideas-table th { padding: 10px 14px; text-align: left; font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; white-space: nowrap; }
    .ideas-table td { padding: 12px 14px; vertical-align: top; border-bottom: 1px solid var(--border); }
    .ideas-table tr:last-child td { border-bottom: none; }
    .ideas-table tr:hover td { background: #ffffff03; }
    .i-name { font-weight: 600; color: var(--text); white-space: nowrap; }
    .i-exp { margin-left: 5px; font-size: 0.7rem; }
    .i-type { font-size: 0.7rem; color: var(--muted); white-space: nowrap; }
    .i-status { font-size: 0.62rem; font-weight: 600; padding: 2px 8px; border-radius: 99px; border: 1px solid; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; }
    .i-date { color: var(--muted); font-size: 0.72rem; white-space: nowrap; }
    .i-summary { color: #94a3b8; line-height: 1.5; max-width: 380px; font-size: 0.78rem; }
    .i-tag { display: inline-block; font-size: 0.6rem; background: var(--border); color: var(--muted); padding: 1px 6px; border-radius: 99px; margin: 1px 2px 0 0; white-space: nowrap; }
    .card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
    .card-title { font-size: 0.9rem; font-weight: 600; line-height: 1.3; }
    .badge { font-size: 0.6rem; font-weight: 700; letter-spacing: .06em; padding: 2px 7px; border-radius: 99px; border: 1px solid; white-space: nowrap; flex-shrink: 0; text-transform: uppercase; }
    .card-notes { font-size: 0.78rem; color: var(--muted); margin-bottom: 10px; }
    .tags { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
    .tag { font-size: 0.65rem; color: var(--accent); background: #7c6ff710; border: 1px solid #7c6ff718; padding: 2px 7px; border-radius: 4px; font-family: monospace; }
    .card-link { font-size: 0.72rem; color: var(--blue); text-decoration: none; opacity: .75; display: flex; align-items: center; gap: 3px; }
    .card-link:hover { opacity: 1; }
    .card-link::before { content: '↗'; }

    /* ── Sidebar ── */
    .sidebar-section { margin-bottom: 28px; }
    .sidebar-title {
      font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .12em; color: var(--muted); margin-bottom: 12px;
      display: flex; align-items: center; gap: 8px;
    }
    .sidebar-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

    /* API Usage */
    .usage-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--border); }
    .usage-row:last-child { border-bottom: none; }
    .usage-key { font-size: 0.75rem; color: var(--muted); }
    .usage-val { font-size: 0.78rem; font-weight: 600; font-family: monospace; }
    .usage-val.cost { color: var(--green); }
    .usage-val.tokens { color: var(--blue); }
    .usage-val.count { color: var(--amber); }

    /* Cron */
    .cron-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .cron-item:last-child { border-bottom: none; }
    .cron-dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
    .cron-info { flex: 1; min-width: 0; }
    .cron-name { font-size: 0.78rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cron-meta { display: flex; flex-direction: column; gap: 1px; margin-top: 3px; }
    .cron-meta span { font-size: 0.65rem; color: var(--muted); }
    .cron-status { font-size: 0.65rem; font-weight: 600; flex-shrink: 0; margin-top: 2px; }

    .empty { font-size: 0.78rem; color: var(--dim); text-align: center; padding: 16px 0; }

    /* Footer */
    .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; padding: 8px; font-size: 0.65rem; color: var(--dim); background: linear-gradient(transparent, var(--bg) 70%); pointer-events: none; }

    /* Context bar */
    .ctx-bar { height: 3px; background: var(--dim); border-radius: 2px; margin-top: 8px; overflow: hidden; }
    .ctx-fill { height: 100%; background: var(--blue); border-radius: 2px; transition: width .5s; }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 4px; }
    a { color: inherit; }
  </style>
</head>
<body>
<div class="app">
  <header>
    <div class="logo">
      <div class="logo-mark">🛸</div>
      <div class="logo-name">War <em>Room</em></div>
    </div>
    <div class="header-right">
      <a href="/possum-au" class="btn-ideas" style="color:#34d399;background:#10b98110;border-color:#10b98130">🦘 Possum AU</a>
      <a href="/possum-us" class="btn-ideas" style="color:#3b82f6;background:#3b82f610;border-color:#3b82f630">🇺🇸 Possum US</a>
      <a href="/possum-crypto" class="btn-ideas" style="color:#f59e0b;background:#f59e0b10;border-color:#f59e0b30">₿ Crypto</a>
      <a href="/possum-pm" class="btn-ideas" style="color:#a78bfa;background:#a78bfa10;border-color:#a78bfa30">🎯 Possum PM</a>
      <a href="/leaderboard" class="btn-ideas" style="color:#fbbf24;background:#fbbf2410;border-color:#fbbf2430">🏆 Leaderboard</a>
      <a href="/ideas" class="btn-ideas">💡 Ideas</a>
      <a href="/schedule" class="btn-ideas" style="color:#fb923c;background:#fb923c10;border-color:#fb923c30">📅 Schedule</a>
      <div class="live"><div class="dot-pulse"></div> Live · ${lastMod}</div>
      <a href="/" class="btn-refresh">↻ Refresh</a>
    </div>
  </header>

  <div class="layout">
    <!-- Main -->
    <div class="main">
      <!-- Stats Bar -->
      <div class="stats-bar">
        <div class="stat-card" data-color="green">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Claude · Today</div>
          <div class="stat-value green">${claude.todayTokens}</div>
          <div class="stat-sub">${claude.weekTokens} this week · ${claude.totalTokens} total</div>
        </div>
        <div class="stat-card" data-color="blue">
          <div class="stat-icon">🧠</div>
          <div class="stat-label">Context Window</div>
          <div class="stat-value blue">${claude.contextPct}%</div>
          <div class="stat-sub">${claude.contextTokens} of 1M · ${claude.todayMessages} msgs today</div>
          <div class="ctx-bar"><div class="ctx-fill" style="width:${claude.contextPct}%"></div></div>
        </div>
        <div class="stat-card" data-color="amber">
          <div class="stat-icon">🔍</div>
          <div class="stat-label">Brave Searches</div>
          <div class="stat-value amber">${brave.today}</div>
          <div class="stat-sub">${brave.total} total searches</div>
        </div>
        <div class="stat-card" data-color="purple">
          <div class="stat-icon">🚀</div>
          <div class="stat-label">Projects</div>
          <div class="stat-value purple">${activeCount + shippedCount + ideasCount}</div>
          <div class="stat-sub">${activeCount} active · ${shippedCount} shipped · ${ideasCount} ideas</div>
        </div>
      </div>

      <!-- Projects -->
      ${sectionsHTML}

      <!-- Ideas Table -->
      <section class="section">
        <h2 class="section-title">💡 SaaS Ideas</h2>
        <div class="ideas-table-wrap">
          <table class="ideas-table">
            <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Date</th><th>Summary</th><th>Tags</th></tr></thead>
            <tbody>${ideasHTML}</tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-section">
        <div class="sidebar-title">⏰ Cron Jobs</div>
        ${cronHTML}
      </div>

      <div class="sidebar-section">
        <div class="sidebar-title">📊 API Breakdown</div>
        <div class="usage-row"><span class="usage-key">Claude · tokens today</span><span class="usage-val">${claude.todayTokens}</span></div>
        <div class="usage-row"><span class="usage-key">Claude · tokens this week</span><span class="usage-val">${claude.weekTokens}</span></div>
        <div class="usage-row"><span class="usage-key">Claude · tokens all time</span><span class="usage-val">${claude.totalTokens}</span></div>
        <div class="usage-row"><span class="usage-key">Context used</span><span class="usage-val tokens">${claude.contextPct}% (${claude.contextTokens})</span></div>
        <div class="usage-row"><span class="usage-key">Messages today</span><span class="usage-val count">${claude.todayMessages}</span></div>
        <div class="usage-row"><span class="usage-key">Brave searches today</span><span class="usage-val count">${brave.today}</span></div>
        <div class="usage-row"><span class="usage-key">Brave searches total</span><span class="usage-val count">${brave.total}</span></div>
      </div>
    </div>
  </div>
</div>

<div class="footer">Maintained by Mia · Auto-refreshes every 30s</div>

<script>setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`);
});

// ── Ideas page ────────────────────────────────────────────────────────────────
const IDEAS_FILE = path.join(__dirname, '../ideas.json');
const LINKEDIN_IDEAS_FILE = path.join(__dirname, '../linkedin-ideas.json');

function getIdeas() {
  try { return JSON.parse(fs.readFileSync(IDEAS_FILE, 'utf-8')); }
  catch { return []; }
}

app.get('/ideas', (req, res) => {
  const ideas = getIdeas().sort((a, b) => new Date(b.date) - new Date(a.date));
  let linkedinIdeas = [];
  try { linkedinIdeas = JSON.parse(fs.readFileSync(LINKEDIN_IDEAS_FILE, 'utf8')); } catch {}
  linkedinIdeas.sort((a, b) => new Date(b.date) - new Date(a.date));
  const statusColor = { idea: '#6b7280', explored: '#7c6ff7', validated: '#f59e0b', building: '#3b82f6', shipped: '#10b981' };
  const rows = ideas.map(i => {
    const sc = statusColor[i.status] || '#6b7280';
    const exploredCell = i.explored ? `<span style="color:#a78bfa;font-size:0.7rem">💬 Explored</span>` : '';
    const tags = (i.tags || []).map(t => `<span class="i-tag">${t}</span>`).join('');
    return `<tr>
      <td class="i-name">${i.name}${i.explored ? '<br><span class="i-exp">💬 Explored</span>' : ''}</td>
      <td><span class="i-type">${i.type || '—'}</span></td>
      <td><span class="i-status" style="background:${sc}20;color:${sc};border-color:${sc}40">${i.status}</span></td>
      <td class="i-date">${fmtDateAU(i.date) || '—'}</td>
      <td class="i-summary">${i.summary || ''}</td>
      <td>${tags}</td>
    </tr>`;
  }).join('');

  res.send(`<!DOCTYPE html><html><head>
<meta charset="UTF-8"><title>Ideas — War Room</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0d0f14;--card:#141720;--border:#1e2230;--border2:#2a2f42;--text:#e2e8f0;--muted:#6b7280;--accent:#7c6ff7;--accent2:#a78bfa;--green:#10b981;--yellow:#f59e0b;--red:#ef4444}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;padding:32px}
  .nav{display:flex;align-items:center;gap:16px;margin-bottom:32px}
  .nav a{color:var(--muted);text-decoration:none;font-size:0.85rem;padding:6px 14px;border-radius:8px;border:1px solid var(--border);transition:.15s}
  .nav a:hover,.nav a.active{color:var(--text);border-color:var(--border2);background:var(--card)}
  .nav-title{font-size:1.1rem;font-weight:700;color:var(--text);margin-right:auto;display:flex;align-items:center;gap:8px}
  .count{font-size:0.7rem;background:var(--accent)20;color:var(--accent2);border:1px solid var(--accent)30;padding:2px 8px;border-radius:99px}
  h1{font-size:1.4rem;font-weight:700;margin-bottom:6px}
  .sub{color:var(--muted);font-size:0.85rem;margin-bottom:28px}
  .table-wrap{overflow-x:auto;border-radius:12px;border:1px solid var(--border)}
  table{width:100%;border-collapse:collapse;background:var(--card)}
  thead tr{border-bottom:1px solid var(--border2)}
  th{padding:12px 16px;text-align:left;font-size:0.7rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-weight:600;white-space:nowrap}
  td{padding:14px 16px;vertical-align:top;border-bottom:1px solid var(--border);font-size:0.85rem}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#ffffff04}
  .i-name{font-weight:600;color:var(--text);min-width:150px}
  .i-exp{font-size:0.65rem;color:var(--accent2);display:block;margin-top:4px}
  .i-type{font-size:0.7rem;color:var(--muted);white-space:nowrap}
  .i-status{font-size:0.65rem;font-weight:600;padding:2px 8px;border-radius:99px;border:1px solid;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
  .i-date{color:var(--muted);font-size:0.75rem;white-space:nowrap}
  .i-summary{color:#94a3b8;line-height:1.5;max-width:420px}
  .i-tag{display:inline-block;font-size:0.6rem;background:var(--border);color:var(--muted);padding:2px 7px;border-radius:99px;margin:2px 2px 0 0}
  .li-section{margin-top:40px}
  .li-section h2{font-size:1.1rem;font-weight:700;margin-bottom:6px}
  .li-section .sub{margin-bottom:20px}
  .li-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .li-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px}
  .li-card:hover{border-color:var(--border2)}
  .li-pillar{display:flex;align-items:center;gap:8px}
  .li-pillar-badge{font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
  .li-date{font-size:0.65rem;color:var(--muted);margin-left:auto}
  .li-title{font-size:0.9rem;font-weight:700;color:var(--text);line-height:1.3}
  .li-opener{font-size:0.75rem;color:#94a3b8;line-height:1.55;font-style:italic;border-left:2px solid var(--border2);padding-left:10px;margin:0}
  .li-where{font-size:0.72rem;color:var(--muted);line-height:1.5}
  .li-news{font-size:0.65rem;color:var(--muted);border-top:1px solid var(--border);padding-top:8px;margin-top:auto}
  .li-status-used{opacity:.45}
</style>
</head><body>
<div class="nav">
  <div class="nav-title">🛸 War Room</div>
  <a href="/">Dashboard</a>
  <a href="/ideas" class="active">Ideas <span class="count">${ideas.length}</span></a>
  <a href="/possum-au" style="color:#34d399;border-color:#10b98130;background:#10b98110">🦘 Possum AU</a>
  <a href="/possum-us" style="color:#34d399;border-color:#10b98130;background:#10b98110">🇺🇸 Possum US</a>
  <a href="/possum-crypto" style="color:#f59e0b;border-color:#f59e0b30;background:#f59e0b10">₿ Crypto</a>
  <a href="/possum-pm" style="color:#a78bfa;border-color:#a78bfa30;background:#a78bfa10">🎯 Possum PM</a>
  <a href="/leaderboard" style="color:#fbbf24;border-color:#fbbf2430;background:#fbbf2410">🏆 Leaderboard</a>
</div>
<h1>💡 All Ideas</h1>
<p class="sub">Every SaaS idea suggested — tracked over time.</p>
<div class="table-wrap">
<table>
  <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Date</th><th>Summary</th><th>Tags</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
${(() => {
  const pillarColors = { 1: '#10b981', 2: '#3b82f6', 3: '#a78bfa' };
  const pillarEmoji = { 1: '🎯', 2: '🤖', 3: '💬' };
  if (!linkedinIdeas.length) return '';
  // Group by date
  const byDate = {};
  linkedinIdeas.forEach(li => {
    if (!byDate[li.date]) byDate[li.date] = [];
    byDate[li.date].push(li);
  });
  const batches = Object.keys(byDate).sort((a,b) => b.localeCompare(a));
  let html = '<div class="li-section"><h2>💼 LinkedIn Post Ideas</h2><p class="sub">Generated by the Mon/Wed/Fri cron — pick one and run with it.</p>';
  batches.forEach(date => {
    const ideas = byDate[date].sort((a,b) => a.pillar - b.pillar);
    const label = new Date(date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    html += '<p style="font-size:.75rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;margin-top:24px">' + label + '</p>';
    html += '<div class="li-grid">';
    ideas.forEach(li => {
      const col = pillarColors[li.pillar] || '#94a3b8';
      const em = pillarEmoji[li.pillar] || '📌';
      const used = li.status === 'used';
      html += '<div class="li-card' + (used ? ' li-status-used' : '') + '">';
      html += '<div class="li-pillar"><span class="li-pillar-badge" style="background:' + col + '20;color:' + col + ';border-color:' + col + '40">' + em + ' P' + li.pillar + ' — ' + li.pillarLabel + '</span>';
      if (li.status === 'used') html += '<span style="font-size:.6rem;color:#10b981;margin-left:auto">✅ used</span>';
      else html += '<span class="li-date">' + new Date(li.date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + '</span>';
      html += '</div>';
      html += '<div class="li-title">' + li.title + '</div>';
      html += '<div class="li-opener">' + li.opener.slice(0, 220) + (li.opener.length > 220 ? '…' : '') + '</div>';
      html += '<div class="li-where">' + li.where + '</div>';
      if (li.news) html += '<div class="li-news">📰 ' + li.news + '</div>';
      html += '</div>';
    });
    html += '</div>';
  });
  html += '</div>';
  return html;
})()}
<script>setTimeout(() => location.reload(), 60000);</script>
</body></html>`);
});

// Track Brave search hits via POST
app.use(express.json());
app.post('/api/brave-hit', (req, res) => {
  try {
    const data = fs.existsSync(BRAVE_COUNTER) ? JSON.parse(fs.readFileSync(BRAVE_COUNTER, 'utf-8')) : { today: 0, total: 0, lastReset: new Date().toDateString() };
    if (data.lastReset !== new Date().toDateString()) { data.today = 0; data.lastReset = new Date().toDateString(); }
    data.today++; data.total++;
    fs.writeFileSync(BRAVE_COUNTER, JSON.stringify(data));
    res.json({ ok: true });
  } catch { res.json({ ok: false }); }
});

// ── Variant Chart Helpers ────────────────────────────────────────────────────
const US_RESULTS_DIR = path.join(__dirname, '../trading-bot-possum/results');

const US_VARIANT_NAMES = {
  'A': 'Swing', 'C': 'Mean Rev', 'D': 'Momentum', 'E2': 'Sentiment',
  'E3': 'Contrarian', 'F': 'PEAD', 'P2': 'Pattern', 'G': 'Vol Div', 'N1': 'News'
};
const AU_VARIANT_NAMES = {
  'V1': 'Swing', 'V2': 'Mean Rev', 'V3': 'Momentum',
  'V4': 'Sentiment', 'V5': 'Industry Mom', 'V6': 'Yield Spread',
  'V7': 'Commodity Beta', 'V8': 'PEAD', 'V9': 'Vol Divergence',
  'V10': 'Opening Range', 'V11': 'Day-of-Week', 'V12': 'A-VIX Mean Rev',
  'V13': 'Franking Ex-Div', 'V14': 'Cross-Market Mom'
};
const CRYPTO_VARIANT_NAMES = {
  'M1': 'EMA Cross', 'M2': 'RSI Mom', 'M3': 'Breakout',
  'MR1': 'BB Revert', 'MR2': 'RSI Extreme', 'MR3': 'FGI Contra',
  'S1': 'Grok Dir', 'S2': 'Grok+Tech', 'S3': 'Grok Contra',
};

const VARIANT_COLORS_9 = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1'
];
const VARIANT_COLORS_14 = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
  '#f43f5e', '#84cc16', '#a855f7', '#0ea5e9'
];

/**
 * Build daily cumulative P&L per variant from archive JSONs (US & AU).
 * Returns { dates: ['03-02', ...], series: { 'A': [0, 12.5, ...], ... } }
 */
function getVariantHistory(resultsDir, filePrefix, startDate) {
  const result = { dates: [], series: {} };
  try {
    const regex = new RegExp(`^${filePrefix}_(\\d{4}-\\d{2}-\\d{2})\\.json$`);
    const files = fs.readdirSync(resultsDir)
      .filter(f => regex.test(f))
      .sort();

    const cumulative = {};  // running sum per variant

    for (const file of files) {
      const dateStr = file.match(regex)[1];
      if (dateStr < startDate) continue;

      let data;
      try { data = JSON.parse(fs.readFileSync(path.join(resultsDir, file), 'utf-8')); } catch { continue; }

      // Aggregate daily P&L by variant
      const dailyPnl = {};
      for (const pos of (data.positions || [])) {
        const v = pos.primary_variant;
        if (!v) continue;
        dailyPnl[v] = (dailyPnl[v] || 0) + (pos.net_pnl || 0);
      }

      // Update cumulative for all known variants
      for (const v of Object.keys(dailyPnl)) {
        cumulative[v] = (cumulative[v] || 0) + dailyPnl[v];
      }

      result.dates.push(dateStr.slice(5)); // MM-DD
      for (const v of Object.keys(cumulative)) {
        if (!result.series[v]) result.series[v] = new Array(result.dates.length - 1).fill(0);
        result.series[v].push(Math.round(cumulative[v] * 100) / 100);
      }
      // Pad any variant that didn't appear this day
      for (const v of Object.keys(result.series)) {
        if (result.series[v].length < result.dates.length) {
          result.series[v].push(result.series[v][result.series[v].length - 1] || 0);
        }
      }
    }
  } catch {}
  return result;
}

/**
 * Build daily cumulative P&L per variant from crypto positions table.
 */
function getCryptoVariantHistory(startDate) {
  const result = { dates: [], series: {} };
  try {
    // Closed positions grouped by close date + variant (competition period)
    const closed = cryptoQuery(
      `SELECT DATE(close_timestamp_utc) as d, variant, SUM(realised_pnl_aud) as pnl
       FROM positions WHERE status='closed' AND entry_timestamp_utc >= '${startDate}'
         AND close_timestamp_utc IS NOT NULL
       GROUP BY d, variant ORDER BY d`
    );

    // Open positions unrealised P&L by variant (competition period, attribute to today)
    const openRows = cryptoQuery(
      `SELECT variant, COALESCE(SUM(unrealised_pnl_aud), 0) as pnl
       FROM positions WHERE status='open' AND entry_timestamp_utc >= '${startDate}'
       GROUP BY variant`
    );

    // Collect all dates
    const dateSet = new Set();
    for (const row of closed) if (row.d) dateSet.add(row.d);
    const today = new Date().toISOString().slice(0, 10);
    if (openRows.length > 0) dateSet.add(today);
    const dates = [...dateSet].sort();

    if (dates.length === 0) return result;

    // Build daily P&L map
    const dailyMap = {};  // { date: { variant: pnl } }
    for (const row of closed) {
      if (!dailyMap[row.d]) dailyMap[row.d] = {};
      dailyMap[row.d][row.variant] = row.pnl || 0;
    }
    // Add open unrealised P&L to today
    for (const row of openRows) {
      if (!dailyMap[today]) dailyMap[today] = {};
      dailyMap[today][row.variant] = (dailyMap[today][row.variant] || 0) + (row.pnl || 0);
    }

    // Build cumulative series
    const cumulative = {};
    for (const date of dates) {
      result.dates.push(date.slice(5));
      const day = dailyMap[date] || {};
      for (const v of Object.keys(day)) {
        cumulative[v] = (cumulative[v] || 0) + day[v];
      }
      for (const v of Object.keys(cumulative)) {
        if (!result.series[v]) result.series[v] = new Array(result.dates.length - 1).fill(0);
        result.series[v].push(Math.round(cumulative[v] * 100) / 100);
      }
      for (const v of Object.keys(result.series)) {
        if (result.series[v].length < result.dates.length) {
          result.series[v].push(result.series[v][result.series[v].length - 1] || 0);
        }
      }
    }
  } catch {}
  return result;
}

/**
 * Build Chart.js datasets array from variant history data.
 */
function buildVariantChartDatasets(history, nameMap, colors) {
  const codes = Object.keys(history.series).sort();
  return codes.map((code, i) => ({
    label: `${code} ${nameMap[code] || ''}`.trim(),
    data: history.series[code],
    borderColor: colors[i % colors.length],
    backgroundColor: colors[i % colors.length] + '20',
    borderWidth: 2,
    pointRadius: 2,
    pointBackgroundColor: colors[i % colors.length],
    tension: 0.3,
    fill: false,
  }));
}

// ── Possum AU ─────────────────────────────────────────────────────────────────
const POSSUM_RESULTS_DIR = path.join(__dirname, '../trading-bot-possum-au/results');
const AU_DB = path.join(__dirname, '../trading-bot-possum-au/possum_au.db');

function auQuery(sql) {
  try {
    const out = execSync(`sqlite3 -json "${AU_DB}" "${sql.replace(/"/g, '\\"')}"`, { timeout: 5000 }).toString().trim();
    return out ? JSON.parse(out) : [];
  } catch { return []; }
}

function getPossumAUData() {
  const allDays = [];
  try {
    const files = fs.readdirSync(POSSUM_RESULTS_DIR)
      .filter(f => f.match(/^possum_au_\d{4}-\d{2}-\d{2}\.json$/))
      .sort();
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(POSSUM_RESULTS_DIR, file), 'utf-8'));
        allDays.push(data);
      } catch {}
    }
  } catch {}
  return allDays;
}

function buildVariantLeaderboard() {
  const startDate = getCompetitionStartDate();
  const variants = {};
  for (let v = 1; v <= 14; v++) variants[`V${v}`] = { code: `V${v}`, trades: 0, totalPnl: 0, wins: 0 };

  // Count actual executed trades from DB (competition period only)
  const dbTrades = auQuery(
    `SELECT variant, COUNT(*) as cnt FROM trades WHERE timestamp_utc >= '${startDate}' GROUP BY variant`
  );
  for (const row of dbTrades) {
    const v = row.variant;
    if (v && variants[v]) {
      variants[v].trades += Number(row.cnt) || 0;
    }
  }

  // Unrealised P&L from open positions (competition period)
  const openPositions = auQuery(
    `SELECT variant, COALESCE(SUM(unrealised_pnl_aud), 0) as pnl FROM positions WHERE status='open' AND entry_timestamp_utc >= '${startDate}' GROUP BY variant`
  );
  for (const row of openPositions) {
    const v = row.variant;
    if (v && variants[v]) {
      variants[v].totalPnl += Number(row.pnl) || 0;
    }
  }

  // Realised P&L + wins from closed positions (competition period)
  const closedPositions = auQuery(
    `SELECT variant, COALESCE(SUM(unrealised_pnl_aud), 0) as pnl,
            SUM(CASE WHEN unrealised_pnl_aud > 0 THEN 1 ELSE 0 END) as wins
     FROM positions WHERE status='closed' AND entry_timestamp_utc >= '${startDate}' GROUP BY variant`
  );
  for (const row of closedPositions) {
    const v = row.variant;
    if (v && variants[v]) {
      variants[v].totalPnl += Number(row.pnl) || 0;
      variants[v].wins += Number(row.wins) || 0;
    }
  }

  return Object.values(variants)
    .sort((a, b) => b.totalPnl - a.totalPnl)
    .map((v, i) => ({
      ...v,
      rank: i + 1,
      winRate: v.trades > 0 ? ((v.wins / v.trades) * 100).toFixed(1) : '—',
      avgPnl: v.trades > 0 ? (v.totalPnl / v.trades) : 0,
    }));
}

function fmtAud(n) {
  if (n === undefined || n === null) return '—';
  const abs = Math.abs(n).toFixed(2);
  return (n < 0 ? '-' : '+') + 'A$' + abs;
}
function pnlClass(n) { return n > 0 ? 'pnl-pos' : n < 0 ? 'pnl-neg' : 'pnl-zero'; }
function medalFor(rank) { return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`; }

app.get('/possum-au', async (req, res) => {
  const markets = await getMarketData();
  const marketOverviewHtml = buildMarketOverviewHtml(markets, 'asx200');
  const compLive = isCompetitionActive();
  const allDays = getPossumAUData();
  const leaderboard = buildVariantLeaderboard();

  // Variant performance chart data
  const startDate = getCompetitionStartDate();
  const auVariantHistory = compLive ? getVariantHistory(POSSUM_RESULTS_DIR, 'possum_au', startDate) : { dates: [], series: {} };
  const auChartDatasets = buildVariantChartDatasets(auVariantHistory, AU_VARIANT_NAMES, VARIANT_COLORS_14);
  const hasAuChart = auVariantHistory.dates.length > 0;

  // Latest day = today's data
  let today = null;
  try {
    const daily = path.join(POSSUM_RESULTS_DIR, 'possum_au_daily.json');
    if (fs.existsSync(daily)) today = JSON.parse(fs.readFileSync(daily, 'utf-8'));
  } catch {}
  if (!today && allDays.length) today = allDays[allDays.length - 1];

  // Open positions from DB (live P&L, competition period only)
  const auOpenPositions = auQuery(
    `SELECT symbol, entry_price_aud, current_price_aud, quantity, unrealised_pnl_aud, variant, entry_timestamp_utc FROM positions WHERE status='open' AND entry_timestamp_utc >= '${startDate}' ORDER BY symbol`
  );
  const auPositionPnl = auOpenPositions.reduce((sum, p) => sum + (Number(p.unrealised_pnl_aud) || 0), 0);

  const regime = today?.regime_state || {};
  const regimeTrend = regime.trend || '—';
  const avix = regime.a_vix != null ? Number(regime.a_vix).toFixed(2) : '—';
  const adx = regime.adx != null ? Number(regime.adx).toFixed(1) : '—';
  const todayPnl = auPositionPnl;
  const todayRet = auPositionPnl ? (auPositionPnl / 15000 * 100) : 0;

  // Actual trade count from DB (competition period only)
  const auTradeCountRow = auQuery(`SELECT COUNT(*) as cnt FROM trades WHERE timestamp_utc >= '${startDate}'`);
  const auTradeCount = auTradeCountRow.length ? (Number(auTradeCountRow[0].cnt) || 0) : 0;

  // Regime badge color
  const regimeColors = { bull: '#10b981', bear: '#ef4444', range_bound: '#f59e0b' };
  const regimeColor = regimeColors[regimeTrend] || '#6b7280';

  // Leaderboard rows
  const auVariantCapitalAud = 15000;  // A$15k per variant
  const activeLeaderboard = leaderboard.filter(v => v.trades > 0);
  const lbRows = activeLeaderboard.length ? activeLeaderboard.map((v, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const pnlC = v.totalPnl > 0 ? '#10b981' : v.totalPnl < 0 ? '#ef4444' : '#64647a';
    const avgC = v.avgPnl > 0 ? '#10b981' : v.avgPnl < 0 ? '#ef4444' : '#64647a';
    const retPct = v.totalPnl != null ? ((v.totalPnl / auVariantCapitalAud) * 100).toFixed(2) + '%' : '—';
    return `<tr>
      <td class="lb-rank">${medal}</td>
      <td class="lb-code"><span class="variant-badge">${v.code}</span></td>
      <td>${v.trades || '—'}</td>
      <td style="color:${pnlC};font-weight:600">${fmtAud(v.totalPnl)}</td>
      <td style="color:${pnlC};font-weight:600">${retPct}</td>
      <td>${v.winRate !== '—' ? v.winRate + '%' : '—'}</td>
      <td style="color:${avgC}">${v.trades > 0 ? fmtAud(v.avgPnl) : '—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-cell">No variant trades yet</td></tr>';

  // Today's signals
  const positions = today?.positions || [];
  const signalRows = positions.length ? positions.map(p => {
    const dirColor = p.direction === 'buy' ? '#10b981' : '#ef4444';
    const conv = p.grok_conviction != null ? (Number(p.grok_conviction) * 100).toFixed(0) + '%' : '—';
    const rationale = (p.grok_rationale || '').slice(0, 120) + ((p.grok_rationale || '').length > 120 ? '…' : '');
    return `<tr>
      <td class="sig-ticker">${p.ticker}</td>
      <td><span class="dir-badge" style="color:${dirColor};border-color:${dirColor}40;background:${dirColor}12">${p.direction?.toUpperCase()}</span></td>
      <td>${conv}</td>
      <td><span class="variant-badge">${p.primary_variant || '—'}</span></td>
      <td class="rationale">${rationale}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty-cell">No signals today</td></tr>';

  // Open positions from DB
  const auPosRows = auOpenPositions.length ? auOpenPositions.map(p => {
    const pnl = Number(p.unrealised_pnl_aud) || 0;
    const pnlC = pnl > 0 ? '#10b981' : pnl < 0 ? '#ef4444' : '#64647a';
    const entry = Number(p.entry_price_aud) || 0;
    const current = Number(p.current_price_aud) || 0;
    const qty = Number(p.quantity) || 0;
    const pnlPct = entry > 0 ? ((current - entry) / entry * 100).toFixed(2) : '0.00';
    const pnlPctC = Number(pnlPct) > 0 ? '#10b981' : Number(pnlPct) < 0 ? '#ef4444' : '#64647a';
    const ticker = (p.symbol || '').replace('.AX', '');
    return `<tr>
      <td class="sig-ticker">${ticker}</td>
      <td><span class="variant-badge">${p.variant || '—'}</span></td>
      <td style="text-align:right">${qty}</td>
      <td style="text-align:right;color:var(--muted)">A$${entry.toFixed(2)}</td>
      <td style="text-align:right;font-weight:600">A$${current.toFixed(2)}</td>
      <td style="color:${pnlC};font-weight:600">${fmtAud(pnl)}</td>
      <td style="color:${pnlPctC};font-weight:600">${Number(pnlPct) > 0 ? '+' : ''}${pnlPct}%</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-cell">No open positions</td></tr>';

  // Recent history (last 14 days)
  const recent = [...allDays].reverse().slice(0, 14);
  const histRows = recent.map(d => {
    const pnlC = (d.net_pnl || 0) > 0 ? '#10b981' : (d.net_pnl || 0) < 0 ? '#ef4444' : '#64647a';
    const retC = (d.daily_return_pct || 0) > 0 ? '#10b981' : (d.daily_return_pct || 0) < 0 ? '#ef4444' : '#64647a';
    const r = d.regime_state?.trend || '—';
    const rc = regimeColors[r] || '#6b7280';
    return `<tr>
      <td>${fmtDateAU(d.date)}</td>
      <td>${d.num_trades ?? '—'}</td>
      <td style="color:${pnlC};font-weight:600">${fmtAud(d.net_pnl || 0)}</td>
      <td style="color:${retC}">${d.daily_return_pct != null ? (d.daily_return_pct > 0 ? '+' : '') + Number(d.daily_return_pct).toFixed(2) + '%' : '—'}</td>
      <td><span style="color:${rc};font-size:0.7rem;font-weight:600;text-transform:capitalize">${r}</span></td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="empty-cell">No history</td></tr>';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Possum AU — War Room</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070711;
      --surface: #0f0f1a;
      --surface2: #13131f;
      --surface3: #191926;
      --border: #ffffff09;
      --border2: #ffffff13;
      --text: #e2e2ee;
      --muted: #64647a;
      --dim: #2a2a3a;
      --accent: #7c6ff7;
      --accent2: #a78bfa;
      --green: #10b981;
      --amber: #f59e0b;
      --blue: #60a5fa;
      --red: #ef4444;
      --r: 10px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none; z-index: 0;
    }
    .app { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px;
      border-bottom: 1px solid var(--border2);
      background: #07071180;
      backdrop-filter: blur(12px);
      position: sticky; top: 0; z-index: 100;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-mark {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, #10b981, #34d399);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      box-shadow: 0 0 20px #10b98130;
    }
    .logo-name { font-size: 0.95rem; font-weight: 700; letter-spacing: -0.3px; }
    .logo-name em { color: #34d399; font-style: normal; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .live { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; color: var(--muted); }
    .dot-pulse { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
    .btn { font-family: inherit; font-size: 0.72rem; color: var(--muted); background: var(--surface); border: 1px solid var(--border2); padding: 5px 12px; border-radius: 6px; cursor: pointer; text-decoration: none; transition: all .15s; }
    .btn:hover { background: var(--surface2); color: var(--text); }
    .btn-accent { color: #34d399; background: #10b98110; border-color: #10b98130; }
    .btn-accent:hover { background: #10b98120; }
    .btn-purple { color: var(--accent2); background: #7c6ff710; border-color: #7c6ff730; }
    .btn-purple:hover { background: #7c6ff720; }

    .content { padding: 28px; flex: 1; max-width: 1400px; width: 100%; }

    /* Hero stats */
    .hero { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin-bottom: 32px; }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--r); padding: 16px; position: relative; overflow: hidden;
    }
    .stat-card::before { content: ''; position: absolute; inset: 0; background: var(--glow, transparent); opacity: .07; pointer-events: none; }
    .stat-card[data-g="green"] { --glow: var(--green); }
    .stat-card[data-g="red"] { --glow: var(--red); }
    .stat-card[data-g="amber"] { --glow: var(--amber); }
    .stat-card[data-g="blue"] { --glow: var(--blue); }
    .stat-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 8px; }
    .stat-value { font-size: 1.4rem; font-weight: 700; line-height: 1; letter-spacing: -0.5px; }
    .stat-value.green { color: var(--green); }
    .stat-value.red { color: var(--red); }
    .stat-value.amber { color: var(--amber); }
    .stat-value.blue { color: var(--blue); }
    .stat-value.zero { color: var(--muted); }
    .stat-sub { font-size: 0.68rem; color: var(--muted); margin-top: 5px; }
    .stat-icon { position: absolute; top: 12px; right: 14px; font-size: 1.1rem; opacity: .4; }

    /* Section headings */
    .section-title {
      font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .12em; color: var(--muted); margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    .section { margin-bottom: 36px; }

    /* Tables */
    .table-wrap { overflow-x: auto; border-radius: var(--r); border: 1px solid var(--border2); }
    table { width: 100%; border-collapse: collapse; background: var(--surface); }
    thead tr { border-bottom: 1px solid var(--border2); }
    th { padding: 10px 14px; text-align: left; font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; white-space: nowrap; }
    td { padding: 11px 14px; vertical-align: middle; border-bottom: 1px solid var(--border); font-size: 0.8rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #ffffff03; }

    .lb-rank { font-size: 1rem; width: 40px; }
    .lb-code { white-space: nowrap; }
    .variant-badge {
      font-size: 0.65rem; font-weight: 700; font-family: monospace;
      background: #7c6ff715; color: var(--accent2);
      border: 1px solid #7c6ff730; padding: 2px 7px; border-radius: 4px;
    }
    .dir-badge {
      font-size: 0.62rem; font-weight: 700;
      padding: 2px 8px; border-radius: 99px; border: 1px solid;
      letter-spacing: .05em;
    }
    .sig-ticker { font-weight: 700; font-size: 0.85rem; }
    .rationale { color: #94a3b8; font-size: 0.75rem; max-width: 420px; line-height: 1.5; }
    .empty-cell { color: var(--muted); text-align: center; padding: 24px; font-size: 0.8rem; }
    .pnl-pos { color: var(--green); }
    .pnl-neg { color: var(--red); }
    .pnl-zero { color: var(--muted); }

    ${MARKET_CSS}

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 4px; }
  </style>
</head>
<body>
<div class="app">
  <header>
    <div class="logo">
      <div class="logo-mark">🦘</div>
      <div class="logo-name">Possum <em>AU</em></div>
    </div>
    ${buildNavHtml('au', 'PAPER mode')}
  </header>

  <div class="content">

    ${marketOverviewHtml}

    <!-- Hero Stats -->
    <div class="hero">
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💵</div>
        <div class="stat-label">Capital</div>
        <div class="stat-value blue">A$15,000</div>
        <div class="stat-sub">Competition cap</div>
      </div>
      <div class="stat-card" data-g="${compLive && todayPnl >= 0 ? 'green' : compLive ? 'red' : 'blue'}">
        <div class="stat-icon">📈</div>
        <div class="stat-label">Today's P&amp;L</div>
        <div class="stat-value ${compLive ? (todayPnl > 0 ? 'green' : todayPnl < 0 ? 'red' : 'zero') : 'zero'}">${compLive ? fmtAud(todayPnl) : '+A$0.00'}</div>
        <div class="stat-sub">${compLive ? fmtDateAU(today?.date) : '—'}</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">📊</div>
        <div class="stat-label">Daily Return</div>
        <div class="stat-value zero">${compLive ? (todayRet != null ? (todayRet > 0 ? '+' : '') + Number(todayRet).toFixed(2) + '%' : '—') : '0.00%'}</div>
        <div class="stat-sub">vs starting capital</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">🌊</div>
        <div class="stat-label">Regime</div>
        <div class="stat-value" style="color:${regimeColor};font-size:1rem;text-transform:capitalize">${regimeTrend}</div>
        <div class="stat-sub">XJO ${regime.xjo_vs_50ma || '—'} 50MA</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">😰</div>
        <div class="stat-label">AVIX</div>
        <div class="stat-value blue">${avix}</div>
        <div class="stat-sub">Aus VIX</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">📐</div>
        <div class="stat-label">ADX</div>
        <div class="stat-value amber">${adx}</div>
        <div class="stat-sub">Trend strength</div>
      </div>
      <div class="stat-card" data-g="green">
        <div class="stat-icon">🔢</div>
        <div class="stat-label">Trades</div>
        <div class="stat-value green">${compLive ? auTradeCount : '0'}</div>
        <div class="stat-sub">${today?.num_trades ? today.num_trades + ' signals analysed' : 'Total executed'}</div>
      </div>
      <div class="stat-card" data-g="green">
        <div class="stat-icon">🏆</div>
        <div class="stat-label">Top Strategy</div>
        <div class="stat-value green" style="font-size:0.95rem">${compLive && activeLeaderboard.length > 0 ? activeLeaderboard[0].code : '—'}</div>
        <div class="stat-sub">${compLive && activeLeaderboard.length > 0 ? fmtAud(activeLeaderboard[0].totalPnl) + ' · ' + activeLeaderboard[0].trades + ' trades' : 'No trades yet'}</div>
      </div>
    </div>

    ${compLive ? `
    <!-- Variant Leaderboard -->
    <section class="section">
      <h2 class="section-title">🏆 Variant Leaderboard</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Variant</th>
              <th>Trades</th>
              <th>Total P&amp;L</th>
              <th>Return %</th>
              <th>Win Rate</th>
              <th>Avg P&amp;L</th>
            </tr>
          </thead>
          <tbody>${lbRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Variant Performance Chart -->
    <section class="section">
      <h2 class="section-title">📈 Variant Performance</h2>
      ${hasAuChart ? `
      <div style="position:relative;height:280px;margin-bottom:8px">
        <canvas id="variantChart"></canvas>
      </div>
      ` : '<div style="text-align:center;padding:40px 0;color:var(--muted)">Chart will appear once trading begins</div>'}
    </section>

    <!-- Open Positions -->
    <section class="section">
      <h2 class="section-title">📊 Open Positions${auOpenPositions.length ? ` (${auOpenPositions.length})` : ''} — ${fmtAud(auPositionPnl)} unrealised</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Variant</th>
              <th style="text-align:right">Qty</th>
              <th style="text-align:right">Entry</th>
              <th style="text-align:right">Current</th>
              <th>P&amp;L</th>
              <th>P&amp;L %</th>
            </tr>
          </thead>
          <tbody>${auPosRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Today's Signals -->
    <section class="section">
      <h2 class="section-title">📡 Analysis Signals — ${fmtDateAU(today?.date) || 'N/A'}</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Direction</th>
              <th>Conviction</th>
              <th>Variant</th>
              <th>Grok Rationale</th>
            </tr>
          </thead>
          <tbody>${signalRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Recent History -->
    <section class="section">
      <h2 class="section-title">📅 Recent History (last 14 days)</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Trades</th>
              <th>P&amp;L</th>
              <th>Return %</th>
              <th>Regime</th>
            </tr>
          </thead>
          <tbody>${histRows}</tbody>
        </table>
      </div>
    </section>
    ` : '<div style="color:var(--muted);text-align:center;padding:40px;font-size:0.85rem">📅 Competition starts soon — data sections will appear once trading begins</div>'}

  </div>
</div>

${hasAuChart ? `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script>
  new Chart(document.getElementById('variantChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: [${auVariantHistory.dates.map(d => `"${fmtDateShort(d)}"`).join(',')}],
      datasets: ${JSON.stringify(auChartDatasets)}
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#a0a0b8', font: { size: 10 }, boxWidth: 12, padding: 10 } },
        tooltip: { backgroundColor: '#1a1d27', borderColor: '#2a2d3a', borderWidth: 1, titleColor: '#e2e2ee', bodyColor: '#e2e2ee', padding: 10 },
      },
      scales: {
        x: { grid: { color: '#ffffff08' }, ticks: { color: '#64647a', font: { size: 10 } } },
        y: { grid: { color: '#ffffff08' }, ticks: { color: '#64647a', font: { size: 10 }, callback: v => 'A$' + v.toFixed(0) } },
      },
    },
  });
</script>
` : ''}
${MARKET_SPARKLINE_SCRIPT}
<script>setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`);
});

// ── Possum US ─────────────────────────────────────────────────────────────────
async function getPossumUSData() {
  try {
    const res = await fetch('http://localhost:8080/api/status', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

function fmtUsd(n) {
  if (n == null) return '—';
  const abs = Math.abs(n).toFixed(2);
  return (n < 0 ? '-' : '+') + '$' + Number(abs).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUsdPlain(n) {
  if (n == null) return '—';
  return '$' + Number(Math.abs(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

app.get('/possum-us', async (req, res) => {
  const [markets, data] = await Promise.all([getMarketData(), getPossumUSData()]);
  const marketOverviewHtml = buildMarketOverviewHtml(markets, 'sp500');
  const compLive = isCompetitionActive();
  const equity = data?.equity ?? null;
  const dailyPnl = data?.daily_pnl ?? 0;
  const dailyPnlPct = data?.daily_pnl_pct ?? 0;
  const totalTrades = data?.total_trades ?? 0;
  const regime = data?.regime ?? '—';
  const apiSpend = data?.api_spend_today ?? 0;
  const botStatus = data?.bot_status ?? '—';
  const variants = (data?.variants || []).slice().sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));
  const positions = data?.positions || [];
  const recentTrades = (data?.recent_trades || []).slice(0, 10);
  const activeVariants = data?.active_variants || [];

  // Variant performance chart data
  const startDate = getCompetitionStartDate();
  const usVariantHistory = compLive ? getVariantHistory(US_RESULTS_DIR, 'possum_us', startDate) : { dates: [], series: {} };
  const usChartDatasets = buildVariantChartDatasets(usVariantHistory, US_VARIANT_NAMES, VARIANT_COLORS_9);
  const hasUsChart = usVariantHistory.dates.length > 0;

  const pclr = (n) => n > 0 ? '#10b981' : n < 0 ? '#ef4444' : '#64647a';
  const statusColor = botStatus === 'ACTIVE' ? '#10b981' : '#ef4444';
  const regimeColor = /bull/i.test(regime) ? '#10b981' : /bear/i.test(regime) ? '#ef4444' : '#f59e0b';

  // Variant leaderboard rows
  const usVariantCapitalUsd = 15000 * 0.63;  // A$15k per variant
  const activeVariantsList = variants.filter(v => (v.trades ?? 0) > 0);
  const variantRows = activeVariantsList.length ? activeVariantsList.map((v, i) => {
    const rank = i + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const pnlC = pclr(v.pnl ?? 0);
    const isActive = v.active || activeVariants.includes(v.code);
    const activeCell = isActive
      ? `<span style="color:#10b981;font-size:0.65rem;font-weight:700;background:#10b98115;border:1px solid #10b98130;padding:2px 7px;border-radius:99px">ACTIVE</span>`
      : `<span style="color:#64647a;font-size:0.65rem;font-weight:700">—</span>`;
    const winRate = v.win_rate != null ? Number(v.win_rate).toFixed(1) + '%' : '—';
    const pf = v.profit_factor != null ? Number(v.profit_factor).toFixed(2) : '—';
    const avgHold = v.avg_hold ?? '—';
    const retPct = v.pnl != null ? ((v.pnl / usVariantCapitalUsd) * 100).toFixed(2) + '%' : '—';
    const retClr = pclr(v.pnl ?? 0);
    return `<tr style="${isActive ? 'background:#10b98106;' : ''}">
      <td class="lb-rank">${medal}</td>
      <td><span class="variant-badge">${v.code}</span></td>
      <td class="lb-name">${v.name || v.code}</td>
      <td>${activeCell}</td>
      <td>${v.trades ?? 0}</td>
      <td style="color:${pnlC};font-weight:600">${fmtUsd(v.pnl ?? 0)}</td>
      <td style="color:${retClr};font-weight:600">${retPct}</td>
      <td>${winRate}</td>
      <td>${pf}</td>
      <td style="color:var(--muted);font-size:0.75rem">${avgHold}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="10" class="empty-cell">No variant trades yet</td></tr>';

  // Open positions rows
  const positionRows = positions.length ? positions.map(p => {
    const pnlC = pclr(p.pnl ?? 0);
    const pnlPct = p.pnl_pct != null ? (p.pnl_pct > 0 ? '+' : '') + Number(p.pnl_pct).toFixed(2) + '%' : '—';
    return `<tr>
      <td class="sig-ticker">${p.symbol}</td>
      <td>${p.qty ?? '—'}</td>
      <td style="color:var(--muted)">$${Number(p.entry).toFixed(2)}</td>
      <td>$${Number(p.current).toFixed(2)}</td>
      <td style="color:${pnlC};font-weight:600">${fmtUsd(p.pnl ?? 0)}</td>
      <td style="color:${pnlC}">${pnlPct}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="empty-cell">No open positions</td></tr>';

  // Recent trades rows
  const tradeRows = recentTrades.map(t => {
    const sideColor = /buy/i.test(t.side) ? '#10b981' : '#ef4444';
    const timeStr = t.time ? new Date(t.time).toLocaleTimeString('en-AU', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) : '—';
    return `<tr>
      <td class="sig-ticker">${t.symbol}</td>
      <td><span class="dir-badge" style="color:${sideColor};border-color:${sideColor}40;background:${sideColor}12">${(t.side || '').toUpperCase()}</span></td>
      <td>${t.qty ?? '—'}</td>
      <td>$${t.price != null ? Number(t.price).toFixed(2) : '—'}</td>
      <td style="color:var(--muted);font-size:0.75rem">${timeStr}</td>
      <td><span class="variant-badge">${t.variant || '—'}</span></td>
      <td style="color:var(--muted);font-size:0.75rem">${t.status || '—'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="empty-cell">No recent trades</td></tr>';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Possum US — War Room</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070711;
      --surface: #0f0f1a;
      --surface2: #13131f;
      --surface3: #191926;
      --border: #ffffff09;
      --border2: #ffffff13;
      --text: #e2e2ee;
      --muted: #64647a;
      --dim: #2a2a3a;
      --accent: #7c6ff7;
      --accent2: #a78bfa;
      --green: #10b981;
      --amber: #f59e0b;
      --blue: #60a5fa;
      --red: #ef4444;
      --r: 10px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none; z-index: 0;
    }
    .app { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px;
      border-bottom: 1px solid var(--border2);
      background: #07071180;
      backdrop-filter: blur(12px);
      position: sticky; top: 0; z-index: 100;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-mark {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, #10b981, #34d399);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      box-shadow: 0 0 20px #10b98130;
    }
    .logo-name { font-size: 0.95rem; font-weight: 700; letter-spacing: -0.3px; }
    .logo-name em { color: #34d399; font-style: normal; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .live { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; color: var(--muted); }
    .dot-pulse { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
    .btn { font-family: inherit; font-size: 0.72rem; color: var(--muted); background: var(--surface); border: 1px solid var(--border2); padding: 5px 12px; border-radius: 6px; cursor: pointer; text-decoration: none; transition: all .15s; }
    .btn:hover { background: var(--surface2); color: var(--text); }
    .btn-accent { color: #34d399; background: #10b98110; border-color: #10b98130; }
    .btn-accent:hover { background: #10b98120; }

    .content { padding: 28px; flex: 1; max-width: 1400px; width: 100%; }

    /* Hero stats */
    .hero { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 12px; margin-bottom: 32px; }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--r); padding: 16px; position: relative; overflow: hidden;
    }
    .stat-card::before { content: ''; position: absolute; inset: 0; background: var(--glow, transparent); opacity: .07; pointer-events: none; }
    .stat-card[data-g="green"] { --glow: var(--green); }
    .stat-card[data-g="red"] { --glow: var(--red); }
    .stat-card[data-g="amber"] { --glow: var(--amber); }
    .stat-card[data-g="blue"] { --glow: var(--blue); }
    .stat-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 8px; }
    .stat-value { font-size: 1.35rem; font-weight: 700; line-height: 1; letter-spacing: -0.5px; }
    .stat-value.green { color: var(--green); }
    .stat-value.red { color: var(--red); }
    .stat-value.amber { color: var(--amber); }
    .stat-value.blue { color: var(--blue); }
    .stat-value.muted { color: var(--muted); }
    .stat-sub { font-size: 0.68rem; color: var(--muted); margin-top: 5px; }
    .stat-icon { position: absolute; top: 12px; right: 14px; font-size: 1.1rem; opacity: .4; }

    /* Section headings */
    .section-title {
      font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .12em; color: var(--muted); margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    .section { margin-bottom: 36px; }

    /* Tables */
    .table-wrap { overflow-x: auto; border-radius: var(--r); border: 1px solid var(--border2); }
    table { width: 100%; border-collapse: collapse; background: var(--surface); }
    thead tr { border-bottom: 1px solid var(--border2); }
    th { padding: 10px 14px; text-align: left; font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; white-space: nowrap; }
    td { padding: 11px 14px; vertical-align: middle; border-bottom: 1px solid var(--border); font-size: 0.8rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #ffffff03; }

    .lb-rank { font-size: 1rem; width: 40px; }
    .lb-name { color: var(--muted); font-size: 0.75rem; max-width: 200px; }
    .variant-badge {
      font-size: 0.65rem; font-weight: 700; font-family: monospace;
      background: #7c6ff715; color: var(--accent2);
      border: 1px solid #7c6ff730; padding: 2px 7px; border-radius: 4px;
    }
    .dir-badge {
      font-size: 0.62rem; font-weight: 700;
      padding: 2px 8px; border-radius: 99px; border: 1px solid;
      letter-spacing: .05em;
    }
    .sig-ticker { font-weight: 700; font-size: 0.85rem; }
    .empty-cell { color: var(--muted); text-align: center; padding: 24px; font-size: 0.8rem; }

    /* Error banner */
    .error-banner {
      background: #ef444410; border: 1px solid #ef444430; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 24px; color: #ef4444; font-size: 0.8rem;
    }

    ${MARKET_CSS}

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 4px; }
  </style>
</head>
<body>
<div class="app">
  <header>
    <div class="logo">
      <div class="logo-mark">🇺🇸</div>
      <div class="logo-name">Possum <em>US</em></div>
    </div>
    ${buildNavHtml('us', botStatus)}
  </header>

  <div class="content">
    ${!data && compLive ? `<div class="error-banner">⚠️ Could not reach Possum US API at http://localhost:8080/api/status — bot may be offline or API not running.</div>` : ''}

    ${marketOverviewHtml}

    <!-- Hero Stats -->
    <div class="hero">
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💵</div>
        <div class="stat-label">Capital</div>
        <div class="stat-value blue">A$15,000</div>
        <div class="stat-sub">Competition cap (~$9,500 USD)</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">📈</div>
        <div class="stat-label">Today P&amp;L</div>
        <div class="stat-value ${compLive ? (dailyPnl > 0 ? 'green' : dailyPnl < 0 ? 'red' : 'muted') : 'muted'}">${compLive ? fmtUsd(dailyPnl) : '$0.00'}</div>
        <div class="stat-sub">Since open</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">📊</div>
        <div class="stat-label">Today P&amp;L %</div>
        <div class="stat-value muted">${compLive ? (dailyPnlPct != null ? (dailyPnlPct > 0 ? '+' : '') + Number(dailyPnlPct).toFixed(2) + '%' : '—') : '0.00%'}</div>
        <div class="stat-sub">vs start of day</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">🔢</div>
        <div class="stat-label">Total Trades</div>
        <div class="stat-value amber">${compLive ? totalTrades : '0'}</div>
        <div class="stat-sub">Trades today</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">🌊</div>
        <div class="stat-label">Regime</div>
        <div class="stat-value" style="color:${regimeColor};font-size:0.9rem;text-transform:capitalize">${regime}</div>
        <div class="stat-sub">Market state</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">💸</div>
        <div class="stat-label">API Spend</div>
        <div class="stat-value amber">$${Number(apiSpend).toFixed(3)}</div>
        <div class="stat-sub">Today's cost</div>
      </div>
      <div class="stat-card" data-g="green">
        <div class="stat-icon">🏆</div>
        <div class="stat-label">Top Strategy</div>
        <div class="stat-value green" style="font-size:0.95rem">${compLive && activeVariantsList.length > 0 ? activeVariantsList[0].code + ' ' + (activeVariantsList[0].name || '') : '—'}</div>
        <div class="stat-sub">${compLive && activeVariantsList.length > 0 ? '$' + Number(activeVariantsList[0].pnl || 0).toFixed(2) + ' · ' + activeVariantsList[0].trades + ' trades' : 'No trades yet'}</div>
      </div>
    </div>

    ${compLive ? `
    <!-- Variant Leaderboard -->
    <section class="section">
      <h2 class="section-title">🏆 Variant Leaderboard</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Code</th>
              <th>Name</th>
              <th>Active</th>
              <th>Trades</th>
              <th>P&amp;L</th>
              <th>Return %</th>
              <th>Win Rate</th>
              <th>Profit Factor</th>
              <th>Avg Hold</th>
            </tr>
          </thead>
          <tbody>${variantRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Variant Performance Chart -->
    <section class="section">
      <h2 class="section-title">📈 Variant Performance</h2>
      ${hasUsChart ? `
      <div style="position:relative;height:280px;margin-bottom:8px">
        <canvas id="variantChart"></canvas>
      </div>
      ` : '<div style="text-align:center;padding:40px 0;color:var(--muted)">Chart will appear once trading begins</div>'}
    </section>

    <!-- Open Positions -->
    <section class="section">
      <h2 class="section-title">📌 Open Positions <span style="font-weight:400;font-size:0.65rem;color:var(--muted);text-transform:none;letter-spacing:0">(${positions.length})</span></h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Qty</th>
              <th>Entry</th>
              <th>Current</th>
              <th>P&amp;L</th>
              <th>P&amp;L %</th>
            </tr>
          </thead>
          <tbody>${positionRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Recent Trades -->
    <section class="section">
      <h2 class="section-title">🔄 Recent Trades <span style="font-weight:400;font-size:0.65rem;color:var(--muted);text-transform:none;letter-spacing:0">(last 10)</span></h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Time (ET)</th>
              <th>Variant</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${tradeRows}</tbody>
        </table>
      </div>
    </section>
    ` : '<div style="color:var(--muted);text-align:center;padding:40px;font-size:0.85rem">📅 Competition starts soon — data sections will appear once trading begins</div>'}

  </div>
</div>

${hasUsChart ? `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script>
  new Chart(document.getElementById('variantChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: [${usVariantHistory.dates.map(d => `"${fmtDateShort(d)}"`).join(',')}],
      datasets: ${JSON.stringify(usChartDatasets)}
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#a0a0b8', font: { size: 10 }, boxWidth: 12, padding: 10 } },
        tooltip: { backgroundColor: '#1a1d27', borderColor: '#2a2d3a', borderWidth: 1, titleColor: '#e2e2ee', bodyColor: '#e2e2ee', padding: 10 },
      },
      scales: {
        x: { grid: { color: '#ffffff08' }, ticks: { color: '#64647a', font: { size: 10 } } },
        y: { grid: { color: '#ffffff08' }, ticks: { color: '#64647a', font: { size: 10 }, callback: v => '$' + v.toFixed(0) } },
      },
    },
  });
</script>
` : ''}
${MARKET_SPARKLINE_SCRIPT}
<script>setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`);
});

// ── Possum PM (Polymarket) ─────────────────────────────────────────────────────
const PM_DB = path.join(__dirname, '../trading-bot-possum-pm/possum_pm.db');
const PM_CONTRACTS_FILE = path.join(__dirname, '../trading-bot-possum-pm/contracts.json');

function pmQuery(sql) {
  try {
    const out = execSync(`sqlite3 -json "${PM_DB}" "${sql.replace(/"/g, '\\"')}"`, { timeout: 5000 }).toString().trim();
    return out ? JSON.parse(out) : [];
  } catch { return []; }
}

// ── Possum Crypto ──────────────────────────────────────────────────────────────
const CRYPTO_DB = path.join(__dirname, '../trading-bot-possum-crypto/possum_crypto.db');

function cryptoQuery(sql) {
  try {
    const out = execSync(`sqlite3 -json "${CRYPTO_DB}" "${sql.replace(/"/g, '\\"')}"`, { timeout: 5000 }).toString().trim();
    return out ? JSON.parse(out) : [];
  } catch { return []; }
}

function fmtAud2(n) {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(Number(n)).toFixed(2);
  return (Number(n) < 0 ? '-' : '+') + 'A$' + abs;
}
function pnlColor(n) { return Number(n) > 0 ? '#10b981' : Number(n) < 0 ? '#ef4444' : '#64647a'; }

const CRYPTO_VARIANTS = ['M1','M2','M3','MR1','MR2','MR3','S1','S2','S3'];

function buildCryptoLeaderboard(signals) {
  const map = {};
  for (const v of CRYPTO_VARIANTS) map[v] = { code: v, signals: 0, executed: 0 };
  for (const s of signals) {
    if (!map[s.variant]) map[s.variant] = { code: s.variant, signals: 0, executed: 0 };
    map[s.variant].signals++;
    if (s.executed) map[s.variant].executed++;
  }
  return Object.values(map).sort((a,b) => b.executed - a.executed);
}

app.get('/possum-crypto', async (req, res) => {
  const markets = await getMarketData();
  const marketOverviewHtml = buildMarketOverviewHtml(markets, 'btc');
  const compLive = isCompetitionActive();
  const dbExists = fs.existsSync(CRYPTO_DB);

  // Variant performance chart data
  const startDate = getCompetitionStartDate();
  const cryptoVariantHistory = compLive ? getCryptoVariantHistory(startDate) : { dates: [], series: {} };
  const cryptoChartDatasets = buildVariantChartDatasets(cryptoVariantHistory, CRYPTO_VARIANT_NAMES, VARIANT_COLORS_9);
  const hasCryptoChart = cryptoVariantHistory.dates.length > 0;

  // Fetch data
  const regimeRows = cryptoQuery('SELECT * FROM crypto_regime_log ORDER BY timestamp_utc DESC LIMIT 1');
  const regime = regimeRows[0] || {};

  const openPositions = cryptoQuery(`SELECT * FROM positions WHERE status='open' AND entry_timestamp_utc >= '${startDate}' ORDER BY entry_timestamp_utc DESC`);
  const closedPositions = cryptoQuery(`SELECT * FROM positions WHERE status='closed' AND entry_timestamp_utc >= '${startDate}' ORDER BY close_timestamp_utc DESC LIMIT 10`);
  const recentSignals = cryptoQuery('SELECT * FROM crypto_signals ORDER BY timestamp_utc DESC LIMIT 15');
  const recentTrades = cryptoQuery(`SELECT * FROM trades WHERE timestamp_utc >= '${startDate}' ORDER BY timestamp_utc DESC LIMIT 10`);
  const cryptoTotalTrades = cryptoQuery(`SELECT COUNT(*) as n FROM positions WHERE status IN ('open','closed') AND entry_timestamp_utc >= '${startDate}'`)[0]?.n || 0;
  const dailyPnl = cryptoQuery(`SELECT * FROM daily_pnl WHERE date >= '${startDate}' ORDER BY date DESC LIMIT 14`);
  const apiCosts = cryptoQuery("SELECT SUM(estimated_cost_usd) as total, SUM(input_tokens) as tin, SUM(output_tokens) as tout FROM api_costs WHERE timestamp_utc >= datetime('now', '-7 days')");

  // Variant P&L leaderboard (competition period only)
  const closedByVariant = cryptoQuery(
    `SELECT variant, COUNT(*) as total,
            SUM(CASE WHEN realised_pnl_aud > 0 THEN 1 ELSE 0 END) as wins,
            COALESCE(SUM(realised_pnl_aud), 0) as pnl,
            SUM(CASE WHEN realised_pnl_aud > 0 THEN realised_pnl_aud ELSE 0 END) as gp,
            SUM(CASE WHEN realised_pnl_aud < 0 THEN ABS(realised_pnl_aud) ELSE 0 END) as gl
     FROM positions WHERE status='closed' AND entry_timestamp_utc >= '${startDate}' GROUP BY variant`
  );
  const openByVariant = cryptoQuery(
    `SELECT variant, COALESCE(SUM(unrealised_pnl_aud), 0) as unrealised
     FROM positions WHERE status='open' AND entry_timestamp_utc >= '${startDate}' GROUP BY variant`
  );
  const closedMap = {};
  for (const r of closedByVariant) closedMap[r.variant] = r;
  const openMap = {};
  for (const r of openByVariant) openMap[r.variant] = r.unrealised || 0;

  const cryptoVariantPnl = CRYPTO_VARIANTS.map(code => {
    const c = closedMap[code] || {};
    const total = c.total || 0;
    const wins = c.wins || 0;
    const realised = c.pnl || 0;
    const unrealised = openMap[code] || 0;
    const gp = c.gp || 0;
    const gl = c.gl || 0;
    const pf = gl > 0 ? (gp / gl) : (gp > 0 ? 99 : 0);
    return {
      code, name: CRYPTO_VARIANT_NAMES[code] || code,
      trades: total, wins, realised, unrealised,
      totalPnl: realised + unrealised,
      winRate: total > 0 ? (wins / total * 100).toFixed(1) : '—',
      pf: total > 0 ? pf.toFixed(2) : '—',
    };
  }).sort((a, b) => b.totalPnl - a.totalPnl);

  const topCryptoVariant = cryptoVariantPnl.find(v => v.trades > 0) || null;

  // Regime badge
  const regimeColors = {
    'EXTREME_FEAR': '#ef4444',
    'BEARISH': '#f97316',
    'NEUTRAL': '#6b7280',
    'BULLISH': '#10b981',
    'EXTREME_GREED': '#06b6d4',
  };
  const regimeLabel = regime.regime || 'UNKNOWN';
  const regimeColor = regimeColors[regimeLabel] || '#6b7280';
  const fgiColor = regime.fgi_value <= 20 ? '#ef4444' : regime.fgi_value >= 80 ? '#06b6d4' : regime.fgi_value >= 55 ? '#10b981' : '#f59e0b';

  // Open positions rows
  const openRows = openPositions.length ? openPositions.map(p => {
    const unrealised = p.unrealised_pnl_aud;
    const upnlColor = pnlColor(unrealised);
    const sideColor = p.side === 'long' ? '#10b981' : '#ef4444';
    return `<tr>
      <td style="font-weight:600">${p.symbol}</td>
      <td><span class="dir-badge" style="color:${sideColor};border-color:${sideColor}40;background:${sideColor}12">${(p.side||'').toUpperCase()}</span></td>
      <td><span class="variant-badge">${p.variant}</span></td>
      <td>A$${Number(p.entry_price).toFixed(2)}</td>
      <td>${Number(p.quantity).toFixed(6)}</td>
      <td style="color:#f59e0b">A$${Number(p.stop_loss).toFixed(2)}</td>
      <td style="color:#10b981">A$${Number(p.take_profit).toFixed(2)}</td>
      <td style="color:${upnlColor};font-weight:600">${unrealised != null ? fmtAud2(unrealised) : '—'}</td>
      <td style="font-size:0.7rem;color:var(--muted)">${p.dry_run ? '📄 paper' : '🟢 live'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="9" class="empty-cell">No open positions</td></tr>';

  // Recent signals rows
  const sigRows = recentSignals.slice(0, 10).map(s => {
    const sigColor = s.signal === 'buy' ? '#10b981' : s.signal === 'sell' ? '#ef4444' : '#6b7280';
    const conf = s.grok_confidence != null ? (Number(s.grok_confidence)*100).toFixed(0)+'%' : '—';
    const ts = s.timestamp_utc ? s.timestamp_utc.slice(11,16) + ' UTC' : '—';
    const reason = (s.reasoning||'').slice(0,90) + ((s.reasoning||'').length>90 ? '…' : '');
    return `<tr>
      <td style="font-size:0.7rem;color:var(--muted)">${ts}</td>
      <td style="font-weight:600">${s.symbol}</td>
      <td><span class="dir-badge" style="color:${sigColor};border-color:${sigColor}40;background:${sigColor}12">${(s.signal||'').toUpperCase()}</span></td>
      <td><span class="variant-badge">${s.variant}</span></td>
      <td>${conf}</td>
      <td style="font-size:0.7rem;color:var(--muted)">${s.regime||'—'}</td>
      <td>${s.fgi_value != null ? s.fgi_value : '—'}</td>
      <td class="rationale">${reason}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="empty-cell">No signals yet</td></tr>';

  // Recent trades rows
  const tradeRows = recentTrades.map(t => {
    const sideColor = t.side === 'buy' ? '#10b981' : '#ef4444';
    const ts = t.timestamp_utc ? fmtTsAU(t.timestamp_utc)+' UTC' : '—';
    return `<tr>
      <td style="font-size:0.7rem;color:var(--muted)">${ts}</td>
      <td style="font-weight:600">${t.symbol}</td>
      <td><span class="dir-badge" style="color:${sideColor};border-color:${sideColor}40;background:${sideColor}12">${(t.side||'').toUpperCase()}</span></td>
      <td>${Number(t.quantity).toFixed(6)}</td>
      <td>A$${Number(t.price_aud).toLocaleString('en-AU', {minimumFractionDigits:2})}</td>
      <td>${t.notional_aud != null ? 'A$'+Number(t.notional_aud).toFixed(2) : '—'}</td>
      <td><span class="variant-badge">${t.variant}</span></td>
      <td style="font-size:0.7rem;color:var(--muted)">${t.dry_run ? '📄' : '🟢'}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="8" class="empty-cell">No trades yet</td></tr>';

  // Closed positions rows
  const closedRows = closedPositions.map(p => {
    const rpnl = p.realised_pnl_aud;
    const rpnlColor = pnlColor(rpnl);
    return `<tr>
      <td style="font-weight:600">${p.symbol}</td>
      <td><span class="variant-badge">${p.variant}</span></td>
      <td style="color:${rpnlColor};font-weight:600">${fmtAud2(rpnl)}</td>
      <td style="font-size:0.7rem;color:var(--muted)">${p.close_reason||'—'}</td>
      <td style="font-size:0.7rem;color:var(--muted)">${fmtDateAU((p.close_timestamp_utc||'').slice(0,10))}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="empty-cell">No closed positions yet</td></tr>';

  // Variant leaderboard rows
  const cryptoVariantCapitalAud = 15000;  // A$15k per variant
  const activeCryptoVariants = cryptoVariantPnl.filter(v => v.trades > 0);
  const lbRows = activeCryptoVariants.length ? activeCryptoVariants.map((v,i) => {
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
    const pnlC = v.totalPnl > 0 ? '#10b981' : v.totalPnl < 0 ? '#ef4444' : 'var(--muted)';
    const retPct = ((v.totalPnl / cryptoVariantCapitalAud) * 100).toFixed(2) + '%';
    return `<tr>
      <td class="lb-rank">${medal}</td>
      <td><span class="variant-badge">${v.code}</span></td>
      <td>${v.name}</td>
      <td>${v.trades}</td>
      <td style="color:${pnlC};font-weight:600">A$${v.realised.toFixed(2)}</td>
      <td style="color:${v.unrealised >= 0 ? '#10b981' : '#ef4444'}">A$${v.unrealised.toFixed(2)}</td>
      <td style="color:${pnlC};font-weight:700">A$${v.totalPnl.toFixed(2)}</td>
      <td style="color:${pnlC};font-weight:600">${retPct}</td>
      <td>${v.winRate}${v.winRate !== '—' ? '%' : ''}</td>
      <td>${v.pf}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="10" class="empty-cell">No variant trades yet</td></tr>';

  // API cost
  const cost = apiCosts[0] || {};
  const totalCost = cost.total ? `$${Number(cost.total).toFixed(4)} USD` : 'A$0.00';

  const cryptoAssets = [...new Set([...openPositions.map(p => p.symbol), ...recentSignals.map(s => s.symbol)])].filter(Boolean).sort();
  const assetList = cryptoAssets.length > 0 ? cryptoAssets : ['BTC/AUD','ETH/AUD','SOL/AUD'];
  const assetCards = assetList.map(sym => {
    const latestSig = recentSignals.find(s => s.symbol === sym);
    const openPos = openPositions.find(p => p.symbol === sym);
    const sigColor = latestSig?.signal === 'buy' ? '#10b981' : latestSig?.signal === 'sell' ? '#ef4444' : '#6b7280';
    return `<div class="asset-card">
      <div style="font-size:0.75rem;color:var(--muted);margin-bottom:4px">${sym}</div>
      <div style="font-size:1.1rem;font-weight:700;color:#fff;margin-bottom:8px">${latestSig?.price_at_signal ? 'A$'+Number(latestSig.price_at_signal).toLocaleString('en-AU',{minimumFractionDigits:2}) : '—'}</div>
      <div style="font-size:0.7rem;margin-bottom:4px">Last signal: <span style="color:${sigColor};font-weight:600">${latestSig?.signal?.toUpperCase()||'—'}</span> <span style="color:var(--muted)">(${latestSig?.variant||'—'})</span></div>
      <div style="font-size:0.7rem;color:var(--muted)">${openPos ? '🟢 Position open' : 'No open position'}</div>
    </div>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Possum Crypto — War Room</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070711;
      --surface: #0f0f1a;
      --surface2: #13131f;
      --surface3: #191926;
      --border: #ffffff09;
      --border2: #ffffff13;
      --text: #e2e2ee;
      --muted: #64647a;
      --dim: #2a2a3a;
      --accent: #f59e0b;
      --accent2: #fbbf24;
      --green: #10b981;
      --amber: #f59e0b;
      --blue: #60a5fa;
      --red: #ef4444;
      --r: 10px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none; z-index: 0;
    }
    .app { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px;
      border-bottom: 1px solid var(--border2);
      background: #07071180;
      backdrop-filter: blur(12px);
      position: sticky; top: 0; z-index: 100;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-mark {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, #f59e0b, #fbbf24);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      box-shadow: 0 0 20px #f59e0b30;
    }
    .logo-name { font-size: 0.95rem; font-weight: 700; letter-spacing: -0.3px; }
    .logo-name em { color: #fbbf24; font-style: normal; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .live { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; color: var(--muted); }
    .dot-pulse { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
    .btn { font-family: inherit; font-size: 0.72rem; color: var(--muted); background: var(--surface); border: 1px solid var(--border2); padding: 5px 12px; border-radius: 6px; cursor: pointer; text-decoration: none; transition: all .15s; }
    .btn:hover { background: var(--surface2); color: var(--text); }
    .btn-accent { color: #34d399; background: #10b98110; border-color: #10b98130; }
    .btn-accent:hover { background: #10b98120; }

    .content { padding: 28px; flex: 1; max-width: 1400px; width: 100%; }

    /* Hero stats */
    .hero { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 32px; }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--r); padding: 16px; position: relative; overflow: hidden;
    }
    .stat-card::before { content: ''; position: absolute; inset: 0; background: var(--glow, transparent); opacity: .07; pointer-events: none; }
    .stat-card[data-g="green"] { --glow: var(--green); }
    .stat-card[data-g="red"] { --glow: var(--red); }
    .stat-card[data-g="amber"] { --glow: var(--amber); }
    .stat-card[data-g="blue"] { --glow: var(--blue); }
    .stat-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 8px; }
    .stat-value { font-size: 1.4rem; font-weight: 700; line-height: 1; letter-spacing: -0.5px; }
    .stat-value.green { color: var(--green); }
    .stat-value.red { color: var(--red); }
    .stat-value.amber { color: var(--amber); }
    .stat-value.blue { color: var(--blue); }
    .stat-value.zero { color: var(--muted); }
    .stat-sub { font-size: 0.68rem; color: var(--muted); margin-top: 5px; }
    .stat-icon { position: absolute; top: 12px; right: 14px; font-size: 1.1rem; opacity: .4; }

    /* Section headings */
    .section-title {
      font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .12em; color: var(--muted); margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    .section { margin-bottom: 36px; }

    /* Tables */
    .table-wrap { overflow-x: auto; border-radius: var(--r); border: 1px solid var(--border2); }
    table { width: 100%; border-collapse: collapse; background: var(--surface); }
    thead tr { border-bottom: 1px solid var(--border2); }
    th { padding: 10px 14px; text-align: left; font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; white-space: nowrap; }
    td { padding: 11px 14px; vertical-align: middle; border-bottom: 1px solid var(--border); font-size: 0.8rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #ffffff03; }

    .variant-badge {
      font-size: 0.65rem; font-weight: 700; font-family: monospace;
      background: #f59e0b15; color: var(--accent2);
      border: 1px solid #f59e0b30; padding: 2px 7px; border-radius: 4px;
    }
    .dir-badge {
      font-size: 0.62rem; font-weight: 700;
      padding: 2px 8px; border-radius: 99px; border: 1px solid;
      letter-spacing: .05em;
    }
    .empty-cell { color: var(--muted); text-align: center; padding: 24px; font-size: 0.8rem; }

    .error-banner {
      background: #ef444410; border: 1px solid #ef444430; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 24px; color: #ef4444; font-size: 0.8rem;
    }

    .asset-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    .asset-card {
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--r); padding: 16px; flex: 1; min-width: 180px;
    }

    ${MARKET_CSS}

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 4px; }
  </style>
</head>
<body>
<div class="app">
<header>
  <div class="logo">
    <div class="logo-mark">₿</div>
    <div class="logo-name">Possum <em>Crypto</em></div>
  </div>
  ${buildNavHtml('crypto', 'PAPER mode')}
</header>

  <div class="content">
    ${!dbExists && compLive ? '<div class="error-banner">⚠️ Crypto DB not found at expected path.</div>' : ''}

    ${marketOverviewHtml}

    <!-- Hero Stats -->
    <div class="hero">
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💵</div>
        <div class="stat-label">Capital</div>
        <div class="stat-value blue">A$15,000</div>
        <div class="stat-sub">Competition cap</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">🌊</div>
        <div class="stat-label">Regime</div>
        <div class="stat-value" style="color:${regimeColor};font-size:1rem;text-transform:capitalize">${regimeLabel}</div>
        <div class="stat-sub">${regime.fgi_label || '—'}</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">😰</div>
        <div class="stat-label">Fear & Greed</div>
        <div class="stat-value amber">${regime.fgi_value != null ? regime.fgi_value : '—'}</div>
        <div class="stat-sub">Crypto FGI</div>
      </div>
      <div class="stat-card" data-g="${compLive && openPositions.length ? 'green' : 'blue'}">
        <div class="stat-icon">📊</div>
        <div class="stat-label">Open Positions</div>
        <div class="stat-value ${compLive && openPositions.length ? 'green' : 'blue'}">${compLive ? openPositions.length : 0}</div>
        <div class="stat-sub">of ${assetList.length} assets</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">🔢</div>
        <div class="stat-label">Total Trades</div>
        <div class="stat-value amber">${compLive ? cryptoTotalTrades : '0'}</div>
        <div class="stat-sub">positions opened</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💸</div>
        <div class="stat-label">API Cost (7d)</div>
        <div class="stat-value blue" style="font-size:1rem">${totalCost}</div>
        <div class="stat-sub">Grok / xAI</div>
      </div>
      <div class="stat-card" data-g="green">
        <div class="stat-icon">🏆</div>
        <div class="stat-label">Top Strategy</div>
        <div class="stat-value green" style="font-size:0.95rem">${compLive && topCryptoVariant ? topCryptoVariant.code + ' ' + topCryptoVariant.name : '—'}</div>
        <div class="stat-sub">${compLive && topCryptoVariant ? 'A$' + topCryptoVariant.totalPnl.toFixed(2) + ' · ' + topCryptoVariant.trades + ' trades' : cryptoVariantPnl.length + ' variants active'}</div>
      </div>
    </div>

    <!-- Asset Cards -->
    ${compLive ? `<div class="asset-row">${assetCards}</div>` : ''}

    ${compLive ? `
    <!-- Open Positions -->
    <section class="section">
      <h2 class="section-title">🟢 Open Positions</h2>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Symbol</th><th>Side</th><th>Variant</th><th>Entry Price</th>
            <th>Qty</th><th>Stop Loss</th><th>Take Profit</th><th>Unrealised P&amp;L</th><th>Mode</th>
          </tr></thead>
          <tbody>${openRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Recent Signals -->
    <section class="section">
      <h2 class="section-title">📡 Recent Signals <span style="font-weight:400;font-size:0.65rem;color:var(--muted);text-transform:none">(last 10)</span></h2>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Time</th><th>Symbol</th><th>Signal</th><th>Variant</th>
            <th>Confidence</th><th>Regime</th><th>FGI</th><th>Reasoning</th>
          </tr></thead>
          <tbody>${sigRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Variant Leaderboard -->
    <section class="section">
      <h2 class="section-title">🏆 Variant Leaderboard</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Rank</th><th>Code</th><th>Strategy</th><th>Trades</th><th>Realised</th><th>Unrealised</th><th>Total P&amp;L</th><th>Return %</th><th>Win%</th><th>PF</th></tr></thead>
          <tbody>${lbRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Variant Performance Chart -->
    <section class="section">
      <h2 class="section-title">📈 Variant Performance</h2>
      ${hasCryptoChart ? `
      <div style="position:relative;height:280px;margin-bottom:8px">
        <canvas id="variantChart"></canvas>
      </div>
      ` : '<div style="text-align:center;padding:40px 0;color:var(--muted)">Chart will appear once trading begins</div>'}
    </section>

    <!-- Recent Trades -->
    <section class="section">
      <h2 class="section-title">🔄 Recent Trades <span style="font-weight:400;font-size:0.65rem;color:var(--muted);text-transform:none">(last 10)</span></h2>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th>
            <th>Price</th><th>Notional</th><th>Variant</th><th>Mode</th>
          </tr></thead>
          <tbody>${tradeRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Closed Positions -->
    <section class="section">
      <h2 class="section-title">✅ Closed Positions <span style="font-weight:400;font-size:0.65rem;color:var(--muted);text-transform:none">(last 10)</span></h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Symbol</th><th>Variant</th><th>Realised P&amp;L</th><th>Close Reason</th><th>Date</th></tr></thead>
          <tbody>${closedRows}</tbody>
        </table>
      </div>
    </section>
    ` : '<div style="color:var(--muted);text-align:center;padding:40px;font-size:0.85rem">📅 Competition starts soon — data sections will appear once trading begins</div>'}

  </div><!-- .content -->
</div><!-- .app -->

${hasCryptoChart ? `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script>
  new Chart(document.getElementById('variantChart').getContext('2d'), {
    type: 'line',
    data: {
      labels: [${cryptoVariantHistory.dates.map(d => `"${fmtDateShort(d)}"`).join(',')}],
      datasets: ${JSON.stringify(cryptoChartDatasets)}
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#a0a0b8', font: { size: 10 }, boxWidth: 12, padding: 10 } },
        tooltip: { backgroundColor: '#1a1d27', borderColor: '#2a2d3a', borderWidth: 1, titleColor: '#e2e2ee', bodyColor: '#e2e2ee', padding: 10 },
      },
      scales: {
        x: { grid: { color: '#ffffff08' }, ticks: { color: '#64647a', font: { size: 10 } } },
        y: { grid: { color: '#ffffff08' }, ticks: { color: '#64647a', font: { size: 10 }, callback: v => 'A$' + v.toFixed(0) } },
      },
    },
  });
</script>
` : ''}
${MARKET_SPARKLINE_SCRIPT}
<script>setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`);
});

// ── Possum PM Route ────────────────────────────────────────────────────────────
app.get('/possum-pm', async (req, res) => {
  // Refresh PM prices from live Polymarket data before rendering
  await fetch('http://localhost:8080/api/pm/refresh', { signal: AbortSignal.timeout(8000) }).catch(() => {});

  const compLive = isCompetitionActive();
  const dbExists = fs.existsSync(PM_DB);
  const contractsRaw = fs.existsSync(PM_CONTRACTS_FILE) ? JSON.parse(fs.readFileSync(PM_CONTRACTS_FILE, 'utf-8')) : [];
  const contracts = contractsRaw.filter(c => c.active !== false);

  // Stats
  const openTrades = dbExists ? pmQuery("SELECT COUNT(*) as n FROM pm_trades WHERE status='open'")[0]?.n || 0 : 0;
  const totalDecisions = dbExists ? pmQuery("SELECT COUNT(*) as n FROM pm_decisions")[0]?.n || 0 : 0;
  const totalTrades = dbExists ? pmQuery("SELECT COUNT(*) as n FROM pm_trades WHERE status IN ('open','closed')")[0]?.n || 0 : 0;
  const apiCost7d = dbExists ? pmQuery(`SELECT ROUND(SUM(estimated_cost_usd),4) as c FROM api_costs WHERE timestamp_utc >= datetime('now','-7 days')`)[0]?.c || 0 : 0;

  // P&L stats
  const pmCapitalAud = 15000;
  const pmRealisedUsd = dbExists ? pmQuery("SELECT COALESCE(SUM(realised_pnl_usd),0) as t FROM pm_trades WHERE status='closed' AND realised_pnl_usd IS NOT NULL")[0]?.t || 0 : 0;
  const pmUnrealisedUsd = dbExists ? pmQuery("SELECT COALESCE(SUM(unrealised_pnl_usd),0) as t FROM pm_trades WHERE status='open' AND unrealised_pnl_usd IS NOT NULL")[0]?.t || 0 : 0;
  const pmTotalPnlUsd = pmRealisedUsd + pmUnrealisedUsd;
  const pmTotalPnlAud = pmTotalPnlUsd * 1.58;
  const pmReturnPct = pmCapitalAud > 0 ? (pmTotalPnlAud / pmCapitalAud * 100).toFixed(2) : '0.00';
  const pmPnlColor = pmTotalPnlUsd > 0 ? '#10b981' : pmTotalPnlUsd < 0 ? '#ef4444' : '#c4c4d4';
  const pmRetColor = Number(pmReturnPct) > 0 ? '#10b981' : Number(pmReturnPct) < 0 ? '#ef4444' : '#c4c4d4';

  // Latest decision per contract
  const latestDecisions = {};
  if (dbExists) {
    for (const c of contracts) {
      const rows = pmQuery(`SELECT * FROM pm_decisions WHERE contract_id='${c.id}' ORDER BY timestamp_utc DESC LIMIT 1`);
      if (rows.length) latestDecisions[c.id] = rows[0];
    }
  }

  // Last 20 pipeline decisions
  const recentDecisions = dbExists ? pmQuery("SELECT * FROM pm_decisions ORDER BY timestamp_utc DESC LIMIT 20") : [];

  // Open paper trades
  const openTradeRows = dbExists ? pmQuery("SELECT * FROM pm_trades WHERE status='open' ORDER BY timestamp_utc DESC") : [];

  // API cost history (last 15 entries)
  const apiHistory = dbExists ? pmQuery("SELECT * FROM api_costs ORDER BY timestamp_utc DESC LIMIT 15") : [];

  // Traded contract ids
  const tradedIds = new Set((dbExists ? pmQuery("SELECT DISTINCT contract_id FROM pm_trades") : []).map(r => r.contract_id));

  // ── GDELT feed data ──
  const gdeltLastFile = dbExists ? pmQuery("SELECT filename, processed_at, articles_found FROM gdelt_processed_files ORDER BY filename DESC LIMIT 1") : [];
  const gdeltTotalArticles = dbExists ? (pmQuery("SELECT COUNT(*) as n FROM gdelt_articles")[0]?.n || 0) : 0;

  const gdeltPerContract = {};
  if (dbExists) {
    for (const c of contracts) {
      const articles24h = pmQuery(`SELECT COUNT(*) as n FROM gdelt_articles WHERE contract_id='${c.id}' AND gkg_timestamp >= strftime('%Y%m%d%H%M%S', datetime('now','-1 day'))`);
      const dailyVolume = pmQuery(`SELECT substr(gkg_timestamp,1,8) as day, COUNT(*) as n FROM gdelt_articles WHERE contract_id='${c.id}' GROUP BY day ORDER BY day DESC LIMIT 5`);
      const headlines = pmQuery(`SELECT headline, source_name, source_tier, gkg_timestamp FROM gdelt_articles WHERE contract_id='${c.id}' AND headline IS NOT NULL AND headline != '' ORDER BY source_tier ASC, gkg_timestamp DESC LIMIT 3`);
      const velocity = latestDecisions[c.id]?.velocity_ratio ?? null;
      gdeltPerContract[c.id] = { articles24h: articles24h[0]?.n || 0, dailyVolume: dailyVolume.reverse(), headlines, velocity };
    }
  }

  // GDELT feed status
  let gdeltIsLive = false;
  let gdeltLastUpdate = '—';
  if (gdeltLastFile.length) {
    const fn = gdeltLastFile[0].filename; // YYYYMMDDHHMMSS
    const y = fn.slice(0,4), mo = fn.slice(4,6), d = fn.slice(6,8), h = fn.slice(8,10), mi = fn.slice(10,12);
    const fileDate = new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`);
    const ageMin = (Date.now() - fileDate.getTime()) / 60000;
    gdeltIsLive = ageMin < 60;
    gdeltLastUpdate = `${d}/${mo}/${y} ${h}:${mi} UTC`;
  }

  // Build GDELT cards HTML
  const gdeltCardsHtml = contracts.map(c => {
    const g = gdeltPerContract[c.id];
    if (!g) return '';
    const velStr = g.velocity != null ? g.velocity.toFixed(1) + 'x' : '—';
    const velColor = g.velocity >= 3.0 ? '#10b981' : '#64647a';
    const name = c.name.replace(/^(US |Will the US )/, '').slice(0, 35);

    // Daily volume bars (normalize to max)
    const maxVol = Math.max(...g.dailyVolume.map(d => d.n), 1);
    const barsHtml = g.dailyVolume.map(d => {
      const px = Math.max(Math.round((d.n / maxVol) * 24), 2);
      const dayLabel = d.day.slice(6, 8) + '/' + d.day.slice(4, 6);
      return `<div style="flex:1;text-align:center"><div class="gdelt-bar" style="height:${px}px"></div><div class="gdelt-bar-label">${dayLabel}</div></div>`;
    }).join('');

    // Headlines
    const headlinesHtml = g.headlines.map(h => {
      const tierClass = h.source_tier === 1 ? 'gdelt-tier1' : h.source_tier === 2 ? 'gdelt-tier2' : '';
      const headline = (h.headline || '').slice(0, 90) + ((h.headline || '').length > 90 ? '…' : '');
      const src = h.source_name || '';
      return `<li>${headline} <span class="gdelt-src ${tierClass}">${src}</span></li>`;
    }).join('');

    return `<div class="gdelt-card">
      <div class="gdelt-card-hdr">
        <span class="gdelt-card-title">${name}</span>
        <span class="gdelt-vel" style="color:${velColor}">⚡ ${velStr}</span>
      </div>
      <div class="gdelt-stat">${g.articles24h.toLocaleString()} <span style="font-size:0.6rem;color:var(--muted)">articles / 24h</span></div>
      <div class="gdelt-bars">${barsHtml}</div>
      <ul class="gdelt-headlines">${headlinesHtml}</ul>
    </div>`;
  }).join('');

  const gdeltSectionHtml = `
    <h3 class="section-title">📡 GDELT FEED</h3>
    <div class="gdelt-status">
      <span class="${gdeltIsLive ? 'gdelt-live' : 'gdelt-stale'}">● ${gdeltIsLive ? 'LIVE' : 'STALE'}</span>
      <span style="color:var(--muted)">Last update: ${gdeltLastUpdate}</span>
      <span style="color:var(--muted)">${Number(gdeltTotalArticles).toLocaleString()} articles ingested</span>
    </div>
    <div class="gdelt-grid">${gdeltCardsHtml}</div>`;

  // Build contract card rows
  function stageBar(n) {
    const total = 5;
    const filled = Math.min(Math.max(Number(n) || 0, 0), total);
    let html = '<span style="display:inline-flex;gap:2px;vertical-align:middle">';
    for (let i = 1; i <= total; i++) {
      const color = i <= filled ? '#a78bfa' : '#1e1e3a';
      html += `<span style="width:12px;height:8px;border-radius:2px;background:${color};display:inline-block"></span>`;
    }
    return html + '</span>';
  }

  const contractCards = contracts.map(c => {
    const d = latestDecisions[c.id];
    const traded = tradedIds.has(c.id);
    let cardBorder = '#1e1e3a';
    let statusDot = '';
    if (traded) { cardBorder = '#10b98140'; statusDot = '<span style="color:#10b981;font-size:0.7rem;font-weight:600"> ✓ TRADE LOGGED</span>'; }
    else if (d && d.alert_passed) { cardBorder = '#f59e0b40'; statusDot = '<span style="color:#f59e0b;font-size:0.7rem;font-weight:600"> ⚡ GATE PASSED</span>'; }
    else if (d && !d.alert_passed) { cardBorder = '#ef444430'; statusDot = '<span style="color:#64647a;font-size:0.7rem"> gate failed</span>'; }

    const manifold = d ? (d.manifold_probability != null ? (Number(d.manifold_probability) * 100).toFixed(1) + '%' : '—') : '—';
    const pmPrice = d ? (d.polymarket_price != null ? '$' + Number(d.polymarket_price).toFixed(3) : '—') : '—';
    const gapPp = d ? (d.gap_pp != null ? Number(d.gap_pp).toFixed(1) + 'pp' : '—') : '—';
    const gapColor = d && Math.abs(Number(d.gap_pp)) > 15 ? '#ef4444' : '#c4c4d4';
    const grokAction = d?.grok_action || '—';
    const grokConf = d ? (d.grok_confidence != null ? (Number(d.grok_confidence) * 100).toFixed(0) + '%' : '—') : '—';
    const stage = d?.stage_reached || 0;
    const alertBadge = d ? (d.alert_passed ? '<span style="color:#10b981">✓ yes</span>' : '<span style="color:#64647a">✗ no</span>') : '—';
    const grokBadge = grokAction === 'enter_yes' ? `<span style="color:#10b981;font-weight:600">${grokAction}</span>`
      : grokAction === 'enter_no' ? `<span style="color:#ef4444;font-weight:600">${grokAction}</span>`
      : `<span style="color:#64647a">${grokAction}</span>`;

    const lastSeen = d ? `<span style="font-size:0.65rem;color:#64647a">${fmtTsAU(d.timestamp_utc)} UTC</span>` : '<span style="color:#64647a;font-size:0.7rem">No data yet</span>';

    return `
    <div style="background:#0d0d1a;border:1px solid ${cardBorder};border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
        <div>
          <div style="font-weight:600;font-size:0.95rem;color:#e0e0f0">${c.name}${statusDot}</div>
          <div style="font-size:0.7rem;color:#64647a;margin-top:2px">Resolves: ${fmtDateAU(c.resolution_date)} · ID: ${c.id}</div>
        </div>
        <div style="text-align:right">${lastSeen}</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:0.8rem">
        <span>Manifold: <strong style="color:#a78bfa">${manifold}</strong></span>
        <span>PM Price: <strong style="color:#c4c4d4">${pmPrice}</strong></span>
        <span>Gap: <strong style="color:${gapColor}">${gapPp}</strong></span>
        <span>Alert Gate: ${alertBadge}</span>
        <span>Grok: ${grokBadge}</span>
        <span>Confidence: <strong>${grokConf}</strong></span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;font-size:0.78rem">
        <span style="color:#64647a">Stage ${stage}/5</span>
        ${stageBar(stage)}
      </div>
    </div>`;
  }).join('');

  // Pipeline decisions table rows
  const decisionRows = recentDecisions.map(d => {
    const grokBg = d.grok_action === 'enter_yes' ? '#10b98120' : d.grok_action === 'enter_no' ? '#ef444420' : '';
    const stg = Number(d.stage_reached) || 0;
    const stageColor = stg >= 4 ? '#10b981' : stg >= 3 ? '#f59e0b' : '#64647a';
    const manifoldPct = d.manifold_probability != null ? (Number(d.manifold_probability) * 100).toFixed(1) + '%' : '—';
    const pmPriceF = d.polymarket_price != null ? '$' + Number(d.polymarket_price).toFixed(3) : '—';
    const gapF = d.gap_pp != null ? Number(d.gap_pp).toFixed(1) + 'pp' : '—';
    const alertF = d.alert_passed ? '<span style="color:#10b981">✓</span>' : '<span style="color:#64647a">✗</span>';
    const grokF = d.grok_action || '—';
    const velocityF = d.velocity_ratio != null ? Number(d.velocity_ratio).toFixed(2) : '—';
    return `<tr style="background:${grokBg}">
      <td style="color:#64647a;font-size:0.7rem">${fmtTsAU(d.timestamp_utc)}</td>
      <td style="font-size:0.8rem">${d.contract_name||d.contract_id}</td>
      <td style="color:${stageColor};font-weight:600">${stg}</td>
      <td>${velocityF}</td>
      <td>${manifoldPct}</td>
      <td>${pmPriceF}</td>
      <td style="color:${Math.abs(Number(d.gap_pp)) > 15 ? '#ef4444' : ''}">${gapF}</td>
      <td>${alertF}</td>
      <td style="font-weight:600;color:${d.grok_action==='enter_yes'?'#10b981':d.grok_action==='enter_no'?'#ef4444':'#64647a'}">${grokF}</td>
      <td style="color:#64647a;font-size:0.75rem">${d.action_taken||'—'}</td>
    </tr>`;
  }).join('');

  // Open trades table rows
  const openTradeHtml = openTradeRows.map(t => {
    const dirColor = t.direction === 'yes' ? '#10b981' : '#ef4444';
    const pnl = t.unrealised_pnl_usd;
    const pnlColor = pnl > 0 ? '#10b981' : pnl < 0 ? '#ef4444' : '#64647a';
    const pnlStr = pnl != null ? (pnl >= 0 ? '+' : '') + '$' + Number(pnl).toFixed(2) : '—';
    const entryF = t.entry_price_usd != null ? '$' + Number(t.entry_price_usd).toFixed(4) : '—';
    const currentF = t.current_price_usd != null ? '$' + Number(t.current_price_usd).toFixed(4) : '—';
    const qtyF = t.quantity != null ? Number(t.quantity).toFixed(0) : '—';
    return `<tr>
      <td style="color:#64647a;font-size:0.7rem">${fmtTsAU(t.timestamp_utc)}</td>
      <td style="font-size:0.8rem">${t.contract_name||t.contract_id}</td>
      <td><span style="color:${dirColor};background:${dirColor}20;padding:2px 8px;border-radius:4px;font-weight:700;font-size:0.75rem">${(t.direction||'').toUpperCase()}</span></td>
      <td>${entryF}</td>
      <td>${currentF}</td>
      <td>${qtyF}</td>
      <td style="color:${pnlColor};font-weight:600">${pnlStr}</td>
      <td>${t.grok_confidence != null ? (Number(t.grok_confidence)*100).toFixed(0)+'%' : '—'}</td>
      <td style="font-size:0.75rem;color:#a78bfa">${t.grok_action||'—'}</td>
    </tr>`;
  }).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Possum PM — War Room</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070711;
      --surface: #0f0f1a;
      --surface2: #13131f;
      --surface3: #191926;
      --border: #ffffff09;
      --border2: #ffffff13;
      --text: #e2e2ee;
      --muted: #64647a;
      --dim: #2a2a3a;
      --accent: #a78bfa;
      --accent2: #c4b5fd;
      --green: #10b981;
      --amber: #f59e0b;
      --blue: #60a5fa;
      --red: #ef4444;
      --r: 10px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none; z-index: 0;
    }
    .app { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px;
      border-bottom: 1px solid var(--border2);
      background: #07071180;
      backdrop-filter: blur(12px);
      position: sticky; top: 0; z-index: 100;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-mark {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, #7c6ff7, #a78bfa);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      box-shadow: 0 0 20px #a78bfa30;
    }
    .logo-name { font-size: 0.95rem; font-weight: 700; letter-spacing: -0.3px; }
    .logo-name em { color: #a78bfa; font-style: normal; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .live { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; color: var(--muted); }
    .dot-pulse { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
    .btn { font-family: inherit; font-size: 0.72rem; color: var(--muted); background: var(--surface); border: 1px solid var(--border2); padding: 5px 12px; border-radius: 6px; cursor: pointer; text-decoration: none; transition: all .15s; }
    .btn:hover { background: var(--surface2); color: var(--text); }
    .btn-accent { color: #34d399; background: #10b98110; border-color: #10b98130; }
    .btn-accent:hover { background: #10b98120; }

    .content { padding: 28px; flex: 1; max-width: 1400px; width: 100%; }

    .hero { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 32px; }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--r); padding: 16px; position: relative; overflow: hidden;
    }
    .stat-card::before { content: ''; position: absolute; inset: 0; background: var(--glow, transparent); opacity: .07; pointer-events: none; }
    .stat-card[data-g="green"] { --glow: var(--green); }
    .stat-card[data-g="red"] { --glow: var(--red); }
    .stat-card[data-g="amber"] { --glow: var(--amber); }
    .stat-card[data-g="blue"] { --glow: var(--blue); }
    .stat-card[data-g="purple"] { --glow: var(--accent); }
    .stat-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 8px; }
    .stat-value { font-size: 1.4rem; font-weight: 700; line-height: 1; letter-spacing: -0.5px; }
    .stat-value.green { color: var(--green); }
    .stat-value.red { color: var(--red); }
    .stat-value.amber { color: var(--amber); }
    .stat-value.blue { color: var(--blue); }
    .stat-value.purple { color: var(--accent); }
    .stat-value.zero { color: var(--muted); }
    .stat-sub { font-size: 0.68rem; color: var(--muted); margin-top: 5px; }
    .stat-icon { position: absolute; top: 12px; right: 14px; font-size: 1.1rem; opacity: .4; }

    .section-title {
      font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .12em; color: var(--muted); margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    .section { margin-bottom: 36px; }

    .table-wrap { overflow-x: auto; border-radius: var(--r); border: 1px solid var(--border2); }
    table { width: 100%; border-collapse: collapse; background: var(--surface); }
    thead tr { border-bottom: 1px solid var(--border2); }
    th { padding: 10px 14px; text-align: left; font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; white-space: nowrap; }
    td { padding: 11px 14px; vertical-align: middle; border-bottom: 1px solid var(--border); font-size: 0.8rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #ffffff03; }

    .empty-cell { color: var(--muted); text-align: center; padding: 24px; font-size: 0.8rem; }
    .empty-msg { color: var(--muted); text-align: center; padding: 24px; font-size: 0.8rem; }
    .contract-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 14px; margin-bottom: 24px; }

    .error-banner {
      background: #ef444410; border: 1px solid #ef444430; border-radius: 8px;
      padding: 12px 16px; margin-bottom: 24px; color: #ef4444; font-size: 0.8rem;
    }

    /* GDELT Feed */
    .gdelt-status { display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: var(--surface); border: 1px solid var(--border2); border-radius: var(--r); margin-bottom: 14px; font-size: 0.7rem; }
    .gdelt-live { color: #10b981; font-weight: 700; }
    .gdelt-stale { color: #f59e0b; font-weight: 700; }
    .gdelt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .gdelt-card { background: var(--surface); border: 1px solid var(--border2); border-radius: var(--r); padding: 12px 14px; }
    .gdelt-card-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .gdelt-card-title { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .gdelt-stat { font-size: 1rem; font-weight: 800; }
    .gdelt-vel { font-size: 0.65rem; font-weight: 600; }
    .gdelt-bars { display: flex; align-items: flex-end; gap: 3px; height: 24px; margin: 6px 0; }
    .gdelt-bar { flex: 1; background: #14b8a6; border-radius: 2px 2px 0 0; min-width: 8px; }
    .gdelt-bar-label { font-size: 0.45rem; color: var(--muted); text-align: center; }
    .gdelt-headlines { list-style: none; padding: 0; margin: 0; }
    .gdelt-headlines li { font-size: 0.62rem; padding: 3px 0; border-bottom: 1px solid var(--border); color: var(--text); line-height: 1.3; }
    .gdelt-headlines li:last-child { border-bottom: none; }
    .gdelt-src { color: var(--muted); font-size: 0.55rem; }
    .gdelt-tier1 { color: #10b981; }
    .gdelt-tier2 { color: #3b82f6; }

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 4px; }
  </style>
</head>
<body>
<div class="app">
<header>
  <div class="logo">
    <div class="logo-mark">🎯</div>
    <div class="logo-name">Possum <em>PM</em></div>
  </div>
  ${buildNavHtml('pm', 'PAPER mode')}
</header>

  <div class="content">
    ${!dbExists && compLive ? '<div class="error-banner">⚠️ Possum PM DB not found. Run the bot at least once.</div>' : ''}

    <!-- Hero Stats -->
    <div class="hero">
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💵</div>
        <div class="stat-label">Capital</div>
        <div class="stat-value blue">A$15,000</div>
        <div class="stat-sub">Competition cap</div>
      </div>
      <div class="stat-card" data-g="${pmTotalPnlUsd >= 0 ? 'green' : 'red'}">
        <div class="stat-icon">💰</div>
        <div class="stat-label">Total P&L</div>
        <div class="stat-value" style="color:${pmPnlColor}">${pmTotalPnlUsd >= 0 ? '+' : ''}$${Number(pmTotalPnlUsd).toFixed(2)}</div>
        <div class="stat-sub">USD (realised + unrealised)</div>
      </div>
      <div class="stat-card" data-g="${Number(pmReturnPct) >= 0 ? 'green' : 'red'}">
        <div class="stat-icon">📊</div>
        <div class="stat-label">Return %</div>
        <div class="stat-value" style="color:${pmRetColor}">${Number(pmReturnPct) >= 0 ? '+' : ''}${pmReturnPct}%</div>
        <div class="stat-sub">vs A$15k capital</div>
      </div>
      <div class="stat-card" data-g="purple">
        <div class="stat-icon">📋</div>
        <div class="stat-label">Active Contracts</div>
        <div class="stat-value purple">${compLive ? contracts.length : 0}</div>
        <div class="stat-sub">in contracts.json</div>
      </div>
      <div class="stat-card" data-g="green">
        <div class="stat-icon">📈</div>
        <div class="stat-label">Open Trades</div>
        <div class="stat-value green">${compLive ? openTrades : 0}</div>
        <div class="stat-sub">paper positions</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">🔢</div>
        <div class="stat-label">Total Decisions</div>
        <div class="stat-value amber">${compLive ? totalDecisions : 0}</div>
        <div class="stat-sub">pipeline runs</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">📊</div>
        <div class="stat-label">Trades Logged</div>
        <div class="stat-value amber">${compLive ? totalTrades : 0}</div>
        <div class="stat-sub">all time</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💸</div>
        <div class="stat-label">API Cost (7d)</div>
        <div class="stat-value blue" style="font-size:1rem">$${Number(apiCost7d).toFixed(4)}</div>
        <div class="stat-sub">USD</div>
      </div>
      <div class="stat-card" data-g="purple">
        <div class="stat-icon">🎯</div>
        <div class="stat-label">Phase</div>
        <div class="stat-value purple" style="font-size:1rem">Phase 1</div>
        <div class="stat-sub">pipeline intelligence</div>
      </div>
    </div>

  ${compLive ? `
  <!-- GDELT Feed -->
  ${gdeltSectionHtml}

  <!-- Contracts Panel -->
  <div class="section">
    <div class="section-title">📋 Contracts Panel</div>
    ${contracts.length === 0
      ? '<div class="empty-msg">No contracts loaded.</div>'
      : `<div class="contract-grid">${contractCards}</div>`}
  </div>

  <!-- Pipeline Decisions Table -->
  <div class="section">
    <div class="section-title">🔍 Pipeline Decisions (last 20)</div>
    ${recentDecisions.length === 0
      ? '<div class="empty-msg">No decisions recorded yet.</div>'
      : `<div class="table-wrap">
        <table>
          <thead><tr>
            <th>Time</th><th>Contract</th><th>Stage</th><th>Velocity</th>
            <th>Manifold %</th><th>PM Price</th><th>Gap pp</th>
            <th>Alert</th><th>Grok Action</th><th>Outcome</th>
          </tr></thead>
          <tbody>${decisionRows}</tbody>
        </table>
      </div>`}
  </div>

  <!-- Open Paper Trades -->
  <div class="section">
    <div class="section-title">📈 Open Paper Trades</div>
    ${openTradeRows.length === 0
      ? '<div class="empty-msg">No open paper trades.</div>'
      : `<div class="table-wrap">
        <table>
          <thead><tr>
            <th>Time</th><th>Contract</th><th>Direction</th><th>Entry $</th>
            <th>Current $</th><th>Qty</th><th>Unrealised P&amp;L</th>
            <th>Grok Conf</th><th>Grok Action</th>
          </tr></thead>
          <tbody>${openTradeHtml}</tbody>
        </table>
      </div>`}
  </div>

  <!-- API Cost History -->
  <div class="section">
    <div class="section-title">💰 API Cost History (last 15)</div>
    ${apiHistory.length === 0
      ? '<div class="empty-msg">No API cost records yet.</div>'
      : `<div class="table-wrap">
        <table>
          <thead><tr><th>Time</th><th>Provider</th><th>Model</th><th>Input Tok</th><th>Output Tok</th><th>Cost USD</th></tr></thead>
          <tbody>
            ${apiHistory.map(a => `<tr>
              <td style="color:#64647a;font-size:0.7rem">${fmtTsAU(a.timestamp_utc)}</td>
              <td>${a.provider||'—'}</td>
              <td style="font-size:0.75rem;color:#a78bfa">${a.model||'—'}</td>
              <td style="color:#64647a">${a.input_tokens||0}</td>
              <td style="color:#64647a">${a.output_tokens||0}</td>
              <td style="color:#10b981">$${Number(a.estimated_cost_usd||0).toFixed(4)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
  </div>
  ` : '<div style="color:var(--muted);text-align:center;padding:40px;font-size:0.85rem">📅 Competition starts soon — data sections will appear once trading begins</div>'}

  </div><!-- .content -->
</div><!-- .app -->

<script>setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`);
});

// ── Leaderboard ──────────────────────────────────────────────────────────────
async function getLeaderboardData() {
  try {
    const res = await fetch('http://localhost:8080/api/leaderboard', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function getMarketData() {
  try {
    const res = await fetch('http://localhost:8080/api/markets', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    return null;
  }
}

app.get('/leaderboard', async (req, res) => {
  const [data, markets] = await Promise.all([getLeaderboardData(), getMarketData()]);
  const bots = data?.ranked || [];
  const competition = data?.competition || {};
  const compActive = competition.active || false;
  const today = data?.today || new Date().toISOString().slice(0, 10);
  const timestamp = data?.timestamp || new Date().toISOString();
  const history = data?.history || [];
  const score = data?.score || {};
  const feeDrag = data?.fee_drag || {};

  // Variant leaderboard data
  const variantLeaderboard = data?.variant_leaderboard || [];
  const variantsWithTrades = compActive ? variantLeaderboard.filter(v => v.total_trades > 0) : [];
  const topVariant = compActive && variantsWithTrades.length > 0 ? variantsWithTrades[0] : null;

  // Per-bot raw data
  const usData = data?.us || {};
  const auData = data?.au || {};
  const cryptoData = data?.crypto || {};
  const pmData = data?.pm || {};

  const botColors = { 'Possum US': '#3b82f6', 'Possum AU': '#34d399', 'Possum Crypto': '#f59e0b', 'Possum PM': '#a78bfa' };
  const botEmojis = { 'Possum US': '🇺🇸', 'Possum AU': '🦘', 'Possum Crypto': '₿', 'Possum PM': '🎯' };
  const botLinks = { 'Possum US': '/possum-us', 'Possum AU': '/possum-au', 'Possum Crypto': '/possum-crypto', 'Possum PM': '/possum-pm' };
  const medals = ['🥇', '🥈', '🥉'];

  function fmtPct(n) {
    if (n == null) return '—';
    return (n > 0 ? '+' : '') + Number(n).toFixed(2) + '%';
  }
  function fmtMoney(n, sym) {
    if (n == null) return '—';
    const abs = Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '-' : n > 0 ? '+' : '') + sym + abs;
  }
  function pnlColor(n) { return n > 0 ? '#10b981' : n < 0 ? '#ef4444' : 'var(--muted)'; }

  // Build table rows for each bot (wider, more info)
  const botRows = bots.map((b, i) => {
    const color = botColors[b.name] || '#64647a';
    const emoji = botEmojis[b.name] || '🤖';
    const link = botLinks[b.name] || '#';
    const medal = medals[i] || `#${i+1}`;
    const preComp = competition.pre_start;
    const ret = preComp ? 0 : (compActive ? (b.comp_pct ?? b.cumulative_pct) : b.cumulative_pct);
    const retStr = fmtPct(ret);
    const retColor = pnlColor(ret);
    const regime = b.regime || '—';
    const dailyPnl = preComp ? null : (compActive && (b.total_trades ?? 0) === 0 ? null : b.daily_pnl);
    const dailyCurr = b.currency_label === 'USD' ? '$' : 'A$';
    const trades = preComp ? 0 : (b.total_trades ?? 0);
    const regimeExtra = b.regime_extra ? ` · ${b.regime_extra}` : '';

    return `<tr>
      <td style="font-size:1.1rem;text-align:center;width:44px">${medal}</td>
      <td>
        <a href="${link}" style="text-decoration:none">
          <span style="font-weight:700;color:${color}">${emoji} ${b.name}</span>
          <span style="display:block;font-size:0.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-top:2px">${b.type || '—'}</span>
        </a>
      </td>
      <td style="font-size:0.75rem;color:var(--muted);text-transform:capitalize">${regime}${regimeExtra}</td>
      <td style="font-weight:800;font-size:1.1rem;color:${retColor};letter-spacing:-0.5px">${retStr}</td>
      <td style="color:${pnlColor(dailyPnl)};font-weight:600">${dailyPnl != null ? fmtMoney(dailyPnl, dailyCurr) : '—'}</td>
      <td style="color:var(--muted)">${trades}</td>
    </tr>`;
  }).join('');

  // Build variant leaderboard rows
  const botBadgeStyles = {
    'US': { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', emoji: '🇺🇸' },
    'AU': { bg: 'rgba(52,211,153,0.15)', color: '#34d399', emoji: '🦘' },
    'CRYPTO': { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', emoji: '₿' },
  };
  const variantMedals = ['🥇', '🥈', '🥉'];

  const variantRowsHtml = variantsWithTrades.length > 0
    ? variantsWithTrades.map((v, i) => {
        const badge = botBadgeStyles[v.bot] || { bg: 'rgba(100,100,122,0.15)', color: '#64647a', emoji: '🤖' };
        const rank = variantMedals[i] || `#${i + 1}`;
        const currSym = v.currency === 'AUD' ? 'A$' : '$';
        const pnlVal = v.pnl ?? 0;
        const pnlStr = (pnlVal < 0 ? '-' : pnlVal > 0 ? '+' : '') + currSym + Math.abs(pnlVal).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const pnlClr = pnlColor(pnlVal);
        const wr = v.win_rate != null ? Number(v.win_rate).toFixed(1) + '%' : '—';
        const pf = v.profit_factor != null ? Number(v.profit_factor).toFixed(2) : '—';
        const retPct = v.return_pct != null ? Number(v.return_pct).toFixed(2) + '%' : '—';
        const retClr = pnlColor(v.return_pct ?? 0);
        return `<tr>
          <td style="text-align:center;font-size:1.1rem;width:44px">${rank}</td>
          <td><span class="variant-badge">${v.variant_code || '—'}</span></td>
          <td style="font-weight:600">${v.variant_name || '—'}</td>
          <td><span class="bot-badge" style="background:${badge.bg};color:${badge.color}">${badge.emoji} ${v.bot}</span></td>
          <td style="color:${pnlClr};font-weight:700">${pnlStr}</td>
          <td style="color:${retClr};font-weight:600">${retPct}</td>
          <td>${v.total_trades ?? 0}</td>
          <td>${wr}</td>
          <td>${pf}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="9" class="empty-cell">Strategy rankings will appear once trading begins</td></tr>';

  // Competition info
  const daysLeft = competition.days_remaining;
  const compBanner = compActive
    ? `<div class="comp-banner green">🏁 Competition Active — Started ${fmtDateAU(competition.start_date)} · Ends ${fmtDateAU(competition.end_date)}${daysLeft != null ? ' · ' + daysLeft + ' days remaining' : ''}</div>`
    : `<div class="comp-banner amber">⏳ Competition starts ${fmtDateAU(competition.start_date) || 'soon'} — All bots racing on A$15,000 starting capital</div>`;

  // Chart data (history) — normalize to competition-relative returns (start at 0%)
  const chartLabels = history.map(h => `"${fmtDateShort(h.date)}"`).join(',');
  const usBase = history.find(h => h.us_cumulative != null)?.us_cumulative ?? 0;
  const auBase = history.find(h => h.au_cumulative != null)?.au_cumulative ?? 0;
  const cryptoBase = history.find(h => h.crypto_cumulative != null)?.crypto_cumulative ?? 0;
  const pmBase = history.find(h => h.pm_cumulative != null)?.pm_cumulative ?? 0;
  const chartUS = history.map(h => h.us_cumulative != null ? (h.us_cumulative - usBase).toFixed(2) : 'null').join(',');
  const chartAU = history.map(h => h.au_cumulative != null ? (h.au_cumulative - auBase).toFixed(2) : 'null').join(',');
  const chartCrypto = history.map(h => h.crypto_cumulative != null ? (h.crypto_cumulative - cryptoBase).toFixed(2) : 'null').join(',');
  const chartPM = history.map(h => h.pm_cumulative != null ? (h.pm_cumulative - pmBase).toFixed(2) : 'null').join(',');
  const hasChart = history.length > 0;

  // Positions summary tables
  const usPositions = usData.positions || [];
  const auPositions = auData.positions || [];
  const cryptoPositions = cryptoData.positions || [];
  const pmTrades = pmData.trades || [];

  const equityPosRows = [...usPositions.map(p => ({...p, bot: '🇺🇸 US', curr: '$'})), ...auPositions.map(p => ({...p, bot: '🦘 AU', curr: 'A$'}))];
  const eqPosHtml = equityPosRows.length ? equityPosRows.map(p => {
    const pColor = pnlColor(p.net_pnl);
    const dir = (p.direction || '').toUpperCase();
    const dirColor = dir === 'BUY' ? '#10b981' : '#ef4444';
    return `<tr>
      <td style="font-size:0.75rem;color:var(--muted)">${p.bot}</td>
      <td style="font-weight:600">${p.ticker || p.symbol || '—'}</td>
      <td><span style="color:${dirColor};font-size:0.65rem;font-weight:700;border:1px solid ${dirColor}40;padding:2px 7px;border-radius:99px">${dir}</span></td>
      <td style="font-size:0.75rem;color:var(--muted)">${p.primary_variant || p.variant || '—'}</td>
      <td style="color:${pColor};font-weight:600">${p.net_pnl != null ? fmtMoney(p.net_pnl, p.curr || '$') : '—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty-cell">No equity positions</td></tr>';

  const cryptoPosHtml = cryptoPositions.length ? cryptoPositions.map(p => {
    const pColor = pnlColor(p.unrealised_pnl_aud);
    return `<tr>
      <td style="font-weight:600">${p.symbol}</td>
      <td><span style="color:#10b981;font-size:0.65rem;font-weight:700;border:1px solid #10b98140;padding:2px 7px;border-radius:99px">${(p.side||'').toUpperCase()}</span></td>
      <td style="font-size:0.75rem;color:var(--muted)">${p.variant || '—'}</td>
      <td style="color:var(--muted)">A$${Number(p.entry_price||0).toFixed(2)}</td>
      <td style="color:${pColor};font-weight:600">${p.unrealised_pnl_aud != null ? fmtMoney(p.unrealised_pnl_aud, 'A$') : '—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty-cell">No crypto positions</td></tr>';

  // ── Market overview cards ──
  const marketOverviewHtml = buildMarketOverviewHtml(markets, 'all');

  const pmOpenTrades = pmTrades.filter(t => t.status === 'open');
  const pmPosHtml = pmOpenTrades.length ? pmOpenTrades.map(t => {
    const pColor = pnlColor(t.unrealised_pnl_usd);
    const dir = (t.direction || '').toUpperCase();
    const dirColor = dir === 'YES' ? '#10b981' : '#ef4444';
    return `<tr>
      <td style="font-weight:600;font-size:0.8rem">${t.contract_name || t.contract_id || '—'}</td>
      <td><span style="color:${dirColor};font-size:0.65rem;font-weight:700;border:1px solid ${dirColor}40;padding:2px 7px;border-radius:99px">${dir}</span></td>
      <td style="color:var(--muted)">$${Number(t.entry_price_usd||0).toFixed(2)}</td>
      <td style="color:${pColor};font-weight:600">${t.unrealised_pnl_usd != null ? fmtMoney(t.unrealised_pnl_usd, '$') : '—'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="4" class="empty-cell">No PM positions</td></tr>';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fleet Leaderboard — War Room</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #070711;
      --surface: #0f0f1a;
      --surface2: #13131f;
      --surface3: #191926;
      --border: #ffffff09;
      --border2: #ffffff13;
      --text: #e2e2ee;
      --muted: #64647a;
      --dim: #2a2a3a;
      --accent: #fbbf24;
      --accent2: #f59e0b;
      --green: #10b981;
      --amber: #f59e0b;
      --blue: #60a5fa;
      --red: #ef4444;
      --r: 10px;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
    }
    body::before {
      content: '';
      position: fixed; inset: 0;
      background-image: linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px);
      background-size: 40px 40px;
      pointer-events: none; z-index: 0;
    }
    .app { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 28px;
      border-bottom: 1px solid var(--border2);
      background: #07071180;
      backdrop-filter: blur(12px);
      position: sticky; top: 0; z-index: 100;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-mark {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, #f59e0b, #fbbf24);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      box-shadow: 0 0 20px #fbbf2430;
    }
    .logo-name { font-size: 0.95rem; font-weight: 700; letter-spacing: -0.3px; }
    .logo-name em { color: #fbbf24; font-style: normal; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .live { display: flex; align-items: center; gap: 5px; font-size: 0.72rem; color: var(--muted); }
    .dot-pulse { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.3; } }
    .btn { font-family: inherit; font-size: 0.72rem; color: var(--muted); background: var(--surface); border: 1px solid var(--border2); padding: 5px 12px; border-radius: 6px; cursor: pointer; text-decoration: none; transition: all .15s; }
    .btn:hover { background: var(--surface2); color: var(--text); }
    .btn-accent { color: #34d399; background: #10b98110; border-color: #10b98130; }
    .btn-accent:hover { background: #10b98120; }

    .content { padding: 28px; flex: 1; max-width: 1400px; width: 100%; }

    /* Hero stats */
    .hero { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 32px; }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--r); padding: 16px; position: relative; overflow: hidden;
    }
    .stat-card::before { content: ''; position: absolute; inset: 0; background: var(--glow, transparent); opacity: .07; pointer-events: none; }
    .stat-card[data-g="green"] { --glow: var(--green); }
    .stat-card[data-g="red"] { --glow: var(--red); }
    .stat-card[data-g="amber"] { --glow: var(--amber); }
    .stat-card[data-g="blue"] { --glow: var(--blue); }
    .stat-label { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin-bottom: 8px; }
    .stat-value { font-size: 1.4rem; font-weight: 700; line-height: 1; letter-spacing: -0.5px; }
    .stat-value.green { color: var(--green); }
    .stat-value.red { color: var(--red); }
    .stat-value.amber { color: var(--amber); }
    .stat-value.blue { color: var(--blue); }
    .stat-value.zero { color: var(--muted); }
    .stat-sub { font-size: 0.68rem; color: var(--muted); margin-top: 5px; }
    .stat-icon { position: absolute; top: 12px; right: 14px; font-size: 1.1rem; opacity: .4; }

    .comp-banner {
      border-radius: var(--r); padding: 14px 20px; margin-bottom: 28px;
      font-size: 0.8rem; font-weight: 600;
    }
    .comp-banner.green { background: #10b98110; border: 1px solid #10b98130; color: #34d399; }
    .comp-banner.amber { background: #f59e0b10; border: 1px solid #f59e0b30; color: #fbbf24; }

    /* Section headings */
    .section-title {
      font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .12em; color: var(--muted); margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    .section { margin-bottom: 36px; }

    /* Tables */
    .table-wrap { overflow-x: auto; border-radius: var(--r); border: 1px solid var(--border2); }
    table { width: 100%; border-collapse: collapse; background: var(--surface); }
    thead tr { border-bottom: 1px solid var(--border2); }
    th { padding: 10px 14px; text-align: left; font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-weight: 600; white-space: nowrap; }
    td { padding: 11px 14px; vertical-align: middle; border-bottom: 1px solid var(--border); font-size: 0.8rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #ffffff03; }
    .empty-cell { color: var(--muted); text-align: center; padding: 24px; font-size: 0.8rem; }

    /* Badges */
    .bot-badge {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .variant-badge {
      font-size: 0.65rem; font-weight: 700; font-family: 'SF Mono', monospace;
      background: #7c6ff715; color: #a78bfa;
      border: 1px solid #7c6ff730; padding: 2px 7px; border-radius: 4px;
    }

    /* Chart */
    .chart-wrap {
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--r); padding: 20px; margin-bottom: 36px;
    }
    .chart-wrap .chart-container { position: relative; height: 220px; }
    .chart-wrap canvas { width: 100% !important; }
    .chart-legend { display: flex; gap: 20px; margin-top: 12px; flex-wrap: wrap; }
    .chart-legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--muted); }
    .chart-legend-dot { width: 8px; height: 8px; border-radius: 50%; }

    /* Two column layout */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

    ${MARKET_CSS}

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--surface3); border-radius: 4px; }
  </style>
</head>
<body>
<div class="app">
  <header>
    <div class="logo">
      <div class="logo-mark">🏆</div>
      <div class="logo-name">Fleet <em>Leaderboard</em></div>
    </div>
    ${buildNavHtml('leaderboard', 'Auto-refresh 30s')}
  </header>

  <div class="content">

    ${compBanner}

    <!-- Market Overview -->
    ${marketOverviewHtml}

    <!-- Hero Stats -->
    <div class="hero">
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">🏆</div>
        <div class="stat-label">Competition</div>
        <div class="stat-value amber">${compActive ? 'LIVE' : 'Pending'}</div>
        <div class="stat-sub">${competition.name || 'Possum Fleet Showdown'}</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💵</div>
        <div class="stat-label">Starting Capital</div>
        <div class="stat-value blue">A$15,000</div>
        <div class="stat-sub">per bot</div>
      </div>
      <div class="stat-card" data-g="green">
        <div class="stat-icon">🤖</div>
        <div class="stat-label">Active Bots</div>
        <div class="stat-value green">${bots.filter(b => b.available).length}</div>
        <div class="stat-sub">of ${bots.length} bots</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">📅</div>
        <div class="stat-label">${compActive ? 'Days Left' : 'Starts In'}</div>
        <div class="stat-value amber">${daysLeft != null ? daysLeft : '—'}</div>
        <div class="stat-sub">${fmtDateAU(competition.start_date)} → ${fmtDateAU(competition.end_date)}</div>
      </div>
      <div class="stat-card" data-g="green">
        <div class="stat-icon">🎯</div>
        <div class="stat-label">Top Strategy</div>
        <div class="stat-value green" style="font-size:1rem">${compActive && topVariant && topVariant.total_trades > 0 ? topVariant.variant_name + ' (' + topVariant.bot + ')' : '—'}</div>
        <div class="stat-sub">${compActive && topVariant && topVariant.total_trades > 0 ? (topVariant.currency === 'AUD' ? 'A$' : '$') + Number(topVariant.pnl || 0).toFixed(2) + ' P&L' : 'Awaiting first trade'}</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">🧬</div>
        <div class="stat-label">Strategies Active</div>
        <div class="stat-value blue">${variantsWithTrades.length}</div>
        <div class="stat-sub">of ${variantLeaderboard.length} strategies</div>
      </div>
    </div>

    <!-- Strategy Leaderboard (Primary) -->
    <section class="section">
      <h2 class="section-title">🧬 Strategy Leaderboard</h2>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:44px">Rank</th>
            <th>Code</th>
            <th>Strategy</th>
            <th>Bot</th>
            <th>P&amp;L</th>
            <th>Return %</th>
            <th>Trades</th>
            <th>Win Rate</th>
            <th>Profit Factor</th>
          </tr></thead>
          <tbody>
            ${variantRowsHtml}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Bot Summary (Secondary) -->
    <section class="section">
      <h2 class="section-title">🤖 Bot Summary</h2>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th style="width:44px">Rank</th>
            <th>Bot</th>
            <th>Regime</th>
            <th>${compActive ? 'Return' : 'All-Time'}</th>
            <th>Today P&amp;L</th>
            <th>Trades</th>
          </tr></thead>
          <tbody>
            ${botRows || '<tr><td colspan="6" class="empty-cell">Could not load leaderboard data</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Performance Chart -->
    <section class="section">
      <h2 class="section-title">📈 Performance Over Time</h2>
      ${hasChart ? `
      <div class="chart-wrap">
        <div class="chart-container"><canvas id="perfChart"></canvas></div>
        <div class="chart-legend">
          <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#3b82f6"></div> Possum US</div>
          <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#34d399"></div> Possum AU</div>
          <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#f59e0b"></div> Crypto</div>
          <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#a78bfa"></div> Possum PM</div>
        </div>
      </div>
      ` : `<div style="text-align:center;padding:40px 0;color:var(--muted)">Chart will appear once trading begins</div>`}
    </section>

    <!-- Positions -->
    <div class="two-col">
      <section class="section">
        <h2 class="section-title">📊 Equity Positions</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Bot</th><th>Ticker</th><th>Dir</th><th>Variant</th><th>P&amp;L</th></tr></thead>
            <tbody>${eqPosHtml}</tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">₿ Crypto Positions</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Symbol</th><th>Side</th><th>Variant</th><th>Entry</th><th>P&amp;L</th></tr></thead>
            <tbody>${cryptoPosHtml}</tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="section">
      <h2 class="section-title">🎯 PM Positions</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Contract</th><th>Dir</th><th>Entry</th><th>P&amp;L</th></tr></thead>
          <tbody>${pmPosHtml}</tbody>
        </table>
      </div>
    </section>

  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
${hasChart ? `
<script>
  const ctx = document.getElementById('perfChart').getContext('2d');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: [${chartLabels}],
      datasets: [
        {
          label: 'US Cumulative %',
          data: [${chartUS}],
          borderColor: '#3b82f6',
          backgroundColor: '#3b82f620',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#3b82f6',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'AU Cumulative %',
          data: [${chartAU}],
          borderColor: '#34d399',
          backgroundColor: '#34d39920',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#34d399',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Crypto Cumulative %',
          data: [${chartCrypto}],
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b20',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#f59e0b',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'PM Cumulative %',
          data: [${chartPM}],
          borderColor: '#a78bfa',
          backgroundColor: '#a78bfa20',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#a78bfa',
          tension: 0.3,
          fill: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1d27',
          borderColor: '#2a2d3a',
          borderWidth: 1,
          titleColor: '#e2e2ee',
          bodyColor: '#e2e2ee',
          padding: 10,
        },
      },
      scales: {
        x: {
          grid: { color: '#ffffff08' },
          ticks: { color: '#64647a', font: { size: 10 } },
        },
        y: {
          grid: { color: '#ffffff08' },
          ticks: {
            color: '#64647a',
            font: { size: 10 },
            callback: v => v.toFixed(1) + '%',
          },
        },
      },
    },
  });
</script>
` : ''}

${MARKET_SPARKLINE_SCRIPT}
<script>setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`);
});

// ── /schedule — Week View ─────────────────────────────────────────────────
app.get('/schedule', (req, res) => {
  const tz = 'Australia/Perth';
  let jobs = [];
  try {
    const raw = JSON.parse(fs.readFileSync(CRON_FILE, 'utf8'));
    jobs = raw.jobs || [];
  } catch {}

  const now = new Date(new Date().toLocaleString('en-AU', { timeZone: tz }));
  const todayKey = now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate();

  const wOffset = parseInt(req.query.w) || 0;

  function getMondayOf(d) {
    const r = new Date(d);
    const dow = r.getDay();
    r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow));
    r.setHours(0, 0, 0, 0);
    return r;
  }

  const monday = getMondayOf(now);
  monday.setDate(monday.getDate() + wOffset * 7);

  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push(d);
  }

  const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function dayKey(d) { return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); }
  function isToday(d) { return dayKey(d) === todayKey; }
  function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }

  function firesOnDay(expr, date) {
    if (!expr) return false;
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 5) return false;
    const [, , domExpr, monExpr, dowExpr] = parts;
    const y = date.getFullYear(), m = date.getMonth()+1, d2 = date.getDate();
    if (monExpr !== '*') {
      if (!monExpr.split(',').map(Number).includes(m)) return false;
    }
    const domMatch = domExpr === '*' || domExpr.split(',').map(Number).includes(d2);
    const jsDow = date.getDay();
    let dowMatch = false;
    if (dowExpr === '*') dowMatch = true;
    else if (dowExpr.includes('-')) {
      const [lo, hi] = dowExpr.split('-').map(Number);
      dowMatch = jsDow >= lo && jsDow <= hi;
    } else {
      dowMatch = dowExpr.split(',').map(Number).includes(jsDow);
    }
    if (domExpr === '*' && dowExpr === '*') return true;
    if (domExpr !== '*' && dowExpr === '*') return domMatch;
    if (domExpr === '*' && dowExpr !== '*') return dowMatch;
    return domMatch || dowMatch;
  }

  function cronTime(expr) {
    if (!expr) return '';
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 2) return '';
    const [minExpr, hrExpr] = parts;
    if (minExpr.startsWith('*/')) return 'every ' + minExpr.slice(2) + ' min';
    if (hrExpr === '*') return '';
    return hrExpr.split(',').map(h => h.padStart(2,'0') + ':' + minExpr.padStart(2,'0')).join(', ');
  }

  function categorise(name) {
    const n = name.toLowerCase();
    if (n.includes('ib gateway') || n.includes('ibwatchdog')) return { color: '#3b82f6', icon: '\uD83D\uDD0C', short: 'IB GW' };
    if (n.includes('meeting alert')) return { color: '#a78bfa', icon: '\uD83D\uDCC5', short: 'Mtg Alert' };
    if (n.includes('morning') || n.includes('summary')) return { color: '#fbbf24', icon: '\u2600\uFE0F', short: 'Morning' };
    if (n.includes('linkedin')) return { color: '#818cf8', icon: '\uD83D\uDCBC', short: 'LinkedIn' };
    if (n.includes('ring') || n.includes('camera')) return { color: '#f87171', icon: '\uD83D\uDCF7', short: 'Ring' };
    if (n.includes('airtouch') || n.includes('air')) return { color: '#67e8f9', icon: '\u2744\uFE0F', short: 'AirTouch' };
    if (n.includes('update') || n.includes('clawdbot')) return { color: '#a3e635', icon: '\u2B06\uFE0F', short: 'Update' };
    if (n.includes('possum') || n.includes('trading')) return { color: '#34d399', icon: '\uD83E\uDD98', short: 'Bot' };
    return { color: '#94a3b8', icon: '\u23F0', short: name.slice(0,12) };
  }

  const recurJobs = jobs.filter(j => j.schedule && j.schedule.expr && j.enabled !== false && !j.deleteAfterRun);
  const oneTimeJobs = jobs.filter(j => j.deleteAfterRun && j.state && j.state.nextRunAtMs);

  function getJobsForDate(date) {
    const fired = recurJobs.filter(j => firesOnDay(j.schedule.expr, date));
    const start = date.getTime();
    const end = start + 86400000;
    const oneTime = oneTimeJobs.filter(j => j.state.nextRunAtMs >= start && j.state.nextRunAtMs < end);
    return { fired, oneTime };
  }

  const wStart = weekDays[0];
  const wEnd = weekDays[6];
  const weekLabel = DAY_NAMES[0] + ' ' + wStart.getDate() + ' ' + MONTH_NAMES[wStart.getMonth()] +
    ' \u2013 ' + DAY_NAMES[6] + ' ' + wEnd.getDate() + ' ' + MONTH_NAMES[wEnd.getMonth()] + ' ' + wEnd.getFullYear();

  let cols = '';
  weekDays.forEach(function(dayDate, idx) {
    const tod = isToday(dayDate);
    const wknd = isWeekend(dayDate);
    const { fired, oneTime } = getJobsForDate(dayDate);

    // Group fired jobs by category — deduplicate so noisy ones (e.g. IB GW) show once
    const catMap = {};
    fired.forEach(function(j) {
      const c = categorise(j.name);
      if (!catMap[c.short]) {
        catMap[c.short] = { c: c, jobs: [] };
      }
      catMap[c.short].jobs.push(j);
    });

    let items = '';
    Object.values(catMap).forEach(function(entry) {
      const c = entry.c;
      const jList = entry.jobs;
      // For single job show its time; for multiple just show count
      let sub = '';
      if (jList.length === 1) {
        const t = cronTime(jList[0].schedule.expr);
        if (t) sub = t;
      } else {
        sub = jList.length + ' jobs';
      }
      items += '<div class="job-item" style="background:' + c.color + '18;border-color:' + c.color + '40">' +
        '<span class="job-icon2">' + c.icon + '</span>' +
        '<div class="job-detail">' +
          '<div class="job-label" style="color:' + c.color + '">' + c.short + '</div>' +
          (sub ? '<div class="job-time">' + sub + '</div>' : '') +
        '</div>' +
        '</div>';
    });
    oneTime.forEach(function(j) {
      const t = new Date(j.state.nextRunAtMs).toLocaleString('en-AU', { timeZone: tz, hour:'2-digit', minute:'2-digit' });
      items += '<div class="job-item ot-item">' +
        '<span class="job-icon2">\uD83D\uDCCC</span>' +
        '<div class="job-detail">' +
          '<div class="job-label" style="color:#fbbf24">' + j.name + '</div>' +
          '<div class="job-time">' + t + '</div>' +
        '</div>' +
        '</div>';
    });
    if (!items) items = '<div class="no-jobs">\u2014</div>';

    cols += '<div class="day-col' + (tod ? ' day-today' : '') + (wknd ? ' day-weekend' : '') + '">' +
      '<div class="day-header">' +
        '<div class="day-name">' + DAY_NAMES[idx] + '</div>' +
        '<div class="day-date' + (tod ? ' is-today' : '') + '">' + dayDate.getDate() + ' ' + MONTH_NAMES[dayDate.getMonth()] + '</div>' +
      '</div>' +
      '<div class="day-body">' + items + '</div>' +
      '</div>';
  });

  let jobList = '';
  jobs.forEach(function(j) {
    const c = categorise(j.name);
    const nextMs = j.state && j.state.nextRunAtMs;
    const nextDt = nextMs ? new Date(nextMs).toLocaleString('en-AU', { timeZone: tz, weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '\u2014';
    const st = (j.state && j.state.lastStatus) || (j.enabled === false ? 'disabled' : 'pending');
    const stColor = st === 'ok' ? '#34d399' : st === 'error' ? '#f87171' : '#94a3b8';
    const expr = (j.schedule && j.schedule.expr) || '\u2014';
    jobList += '<div class="job-row">' +
      '<div class="job-icon">' + c.icon + '</div>' +
      '<div class="job-info">' +
        '<div class="job-name">' + j.name + '</div>' +
        '<div class="job-sched">' + expr + '</div>' +
      '</div>' +
      '<div class="job-next">' + nextDt + '</div>' +
      '<span class="badge" style="color:' + stColor + '">' + st + '</span>' +
      '</div>';
  });

  const prevW = wOffset - 1;
  const nextW = wOffset + 1;

  const html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>Schedule \u2014 War Room</title>\n' +
    '<style>\n' +
    '  :root{--bg:#0d0f14;--card:#141720;--border:#1e2230;--border2:#2a2f42;--text:#e2e8f0;--muted:#6b7280;--accent:#7c6ff7;--accent2:#a78bfa;--green:#10b981;--yellow:#f59e0b;--red:#ef4444;--surface:#0f0f1a;--surface2:#13131f}\n' +
    '  *{box-sizing:border-box;margin:0;padding:0}\n' +
    '  body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh;padding:0}\n' +
    '  header{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;border-bottom:1px solid var(--border2);background:#07071180;backdrop-filter:blur(12px);position:sticky;top:0;z-index:100}\n' +
    '  .logo{display:flex;align-items:center;gap:10px}\n' +
    '  .logo-mark{width:32px;height:32px;background:linear-gradient(135deg,#fb923c,#f59e0b);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 0 20px #fb923c30}\n' +
    '  .logo-name{font-size:0.95rem;font-weight:700;letter-spacing:-0.3px}\n' +
    '  .logo-name em{color:#fb923c;font-style:normal}\n' +
    '  .header-right{display:flex;align-items:center;gap:12px}\n' +
    '  .content{padding:28px}\n' +
    '  .btn{font-family:inherit;font-size:0.72rem;color:var(--muted);background:var(--surface);border:1px solid var(--border2);padding:5px 12px;border-radius:6px;cursor:pointer;text-decoration:none;transition:all .15s}\n' +
    '  .btn:hover{background:var(--surface2);color:var(--text)}\n' +
    '  .live{display:flex;align-items:center;gap:5px;font-size:0.72rem;color:var(--muted)}\n' +
    '  .dot-pulse{width:5px;height:5px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}\n' +
    '  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}\n' +
    '  .section-title{font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);margin-bottom:12px}\n' +
    '  .week-nav{display:flex;align-items:center;gap:14px;margin-bottom:24px}\n' +
    '  .week-nav a.nav-arrow{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--border2);background:var(--card);color:var(--text);text-decoration:none;font-size:1rem;transition:.15s}\n' +
    '  .week-nav a.nav-arrow:hover{background:var(--border2)}\n' +
    '  .week-title{font-size:1rem;font-weight:700;color:var(--text)}\n' +
    '  .today-lnk{color:var(--muted);text-decoration:none;font-size:0.85rem;padding:5px 12px;border-radius:8px;border:1px solid var(--border);transition:.15s}\n' +
    '  .today-lnk:hover{color:var(--text);border-color:var(--border2);background:var(--card)}\n' +
    '  .week-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:32px}\n' +
    '  .day-col{background:var(--card);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}\n' +
    '  .day-col.day-weekend{opacity:.6}\n' +
    '  .day-col.day-today{border-color:#fb923c55;box-shadow:0 0 0 1px #fb923c18}\n' +
    '  .day-header{padding:10px 10px 8px;border-bottom:1px solid var(--border);background:#0d0f14}\n' +
    '  .day-name{font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}\n' +
    '  .day-date{font-size:.9rem;font-weight:800;color:var(--text);margin-top:2px}\n' +
    '  .day-date.is-today{color:#fb923c}\n' +
    '  .day-body{padding:8px;display:flex;flex-direction:column;gap:5px;flex:1}\n' +
    '  .job-item{display:flex;align-items:flex-start;gap:6px;padding:5px 7px;border-radius:6px;border:1px solid transparent}\n' +
    '  .job-icon2{font-size:.85rem;flex-shrink:0;line-height:1.4}\n' +
    '  .job-detail{min-width:0}\n' +
    '  .job-label{font-size:.6rem;font-weight:700;line-height:1.3;word-break:break-word}\n' +
    '  .job-time{font-size:.55rem;color:var(--muted);margin-top:1px;font-weight:600}\n' +
    '  .ot-item{background:#fbbf2412;border-color:#fbbf2430}\n' +
    '  .no-jobs{font-size:.6rem;color:var(--muted);padding:8px 4px;text-align:center}\n' +
    '  .job-list{display:flex;flex-direction:column;gap:8px}\n' +
    '  .job-row{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 14px;display:flex;align-items:center;gap:12px}\n' +
    '  .job-icon{font-size:1.1rem;flex-shrink:0}\n' +
    '  .job-info{flex:1;min-width:0}\n' +
    '  .job-name{font-size:.8rem;font-weight:600}\n' +
    '  .job-sched{font-size:.65rem;color:var(--muted);margin-top:2px}\n' +
    '  .job-next{font-size:.65rem;font-weight:600;color:#fbbf24;white-space:nowrap}\n' +
    '  .badge{font-size:.6rem;padding:2px 8px;border-radius:20px;font-weight:700;background:var(--border2)}\n' +
    '</style>\n</head>\n<body>\n' +
    '<header>\n' +
    '  <div class="logo"><div class="logo-mark">📅</div><div class="logo-name"><em>Schedule</em></div></div>\n' +
    '  ' + buildNavHtml('schedule', 'Auto-refresh 60s') + '\n' +
    '</header>\n' +
    '<div class="content">\n' +
    '<div class="week-nav">\n' +
    '  <a href="/schedule?w=' + prevW + '" class="nav-arrow">\u2039</a>\n' +
    '  <div class="week-title">' + weekLabel + '</div>\n' +
    '  <a href="/schedule?w=' + nextW + '" class="nav-arrow">\u203A</a>\n' +
    (wOffset !== 0 ? '  <a href="/schedule" class="today-lnk">Today</a>\n' : '') +
    '</div>\n' +
    '<div class="week-grid">' + cols + '</div>\n' +
    '<div class="section-title">All Jobs (' + jobs.length + ' total)</div>\n' +
    '<div class="job-list">' + jobList + '</div>\n' +
    '<p style="color:var(--muted);font-size:.65rem;margin-top:28px;text-align:center">Auto-refreshes every 60s \u00B7 AWST</p>\n' +
    '</div>\n' +
    '<script>setTimeout(() => location.reload(), 60000);</script>\n' +
    '</body></html>';

  res.send(html);
});


const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🛸 War Room → http://localhost:${PORT}`);
  console.log(`🌐 Network  → http://192.168.68.70:${PORT}`);
  // Write PID file for clean restarts
  fs.writeFileSync(path.join(__dirname, '.war-room.pid'), String(process.pid));
});

// Graceful shutdown — release port so restarts don't hit EADDRINUSE
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully`);
  server.close(() => {
    try { fs.unlinkSync(path.join(__dirname, '.war-room.pid')); } catch {}
    process.exit(0);
  });
  // Force exit after 5s if connections don't drain
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
