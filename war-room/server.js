const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const app = express();
const PORT = 3002;
const PROJECTS_FILE = path.join(__dirname, '../projects.md');
const SESSIONS_DIR = path.join(os.homedir(), '.clawdbot/agents/main/sessions');
const CRON_FILE = path.join(os.homedir(), '.clawdbot/cron/jobs.json');
const BRAVE_COUNTER = path.join(__dirname, 'brave-usage.json');
const COMPETITION_JSON = path.join(__dirname, '../trading-bot-possum/interface/competition.json');

function isCompetitionActive() {
  try {
    const comp = JSON.parse(fs.readFileSync(COMPETITION_JSON, 'utf8')).competition;
    const today = new Date().toISOString().slice(0, 10);
    return today >= comp.start_date && today <= comp.end_date;
  } catch { return false; }
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
      <td class="i-date">${i.date||'—'}</td>
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

function getIdeas() {
  try { return JSON.parse(fs.readFileSync(IDEAS_FILE, 'utf-8')); }
  catch { return []; }
}

app.get('/ideas', (req, res) => {
  const ideas = getIdeas().sort((a, b) => new Date(b.date) - new Date(a.date));
  const statusColor = { idea: '#6b7280', explored: '#7c6ff7', validated: '#f59e0b', building: '#3b82f6', shipped: '#10b981' };
  const rows = ideas.map(i => {
    const sc = statusColor[i.status] || '#6b7280';
    const exploredCell = i.explored ? `<span style="color:#a78bfa;font-size:0.7rem">💬 Explored</span>` : '';
    const tags = (i.tags || []).map(t => `<span class="i-tag">${t}</span>`).join('');
    return `<tr>
      <td class="i-name">${i.name}${i.explored ? '<br><span class="i-exp">💬 Explored</span>' : ''}</td>
      <td><span class="i-type">${i.type || '—'}</span></td>
      <td><span class="i-status" style="background:${sc}20;color:${sc};border-color:${sc}40">${i.status}</span></td>
      <td class="i-date">${i.date || '—'}</td>
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

// ── Possum AU ─────────────────────────────────────────────────────────────────
const POSSUM_RESULTS_DIR = path.join(__dirname, '../trading-bot-possum-au/results');

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

function buildVariantLeaderboard(allDays) {
  const variants = {};
  for (let v = 1; v <= 14; v++) variants[`V${v}`] = { code: `V${v}`, trades: 0, totalPnl: 0, wins: 0 };

  for (const day of allDays) {
    for (const pos of (day.positions || [])) {
      const v = pos.primary_variant;
      if (!v || !variants[v]) continue;
      variants[v].trades++;
      variants[v].totalPnl += pos.net_pnl || 0;
      if ((pos.net_pnl || 0) > 0) variants[v].wins++;
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

app.get('/possum-au', (req, res) => {
  const compLive = isCompetitionActive();
  const allDays = getPossumAUData();
  const leaderboard = buildVariantLeaderboard(allDays);

  // Latest day = today's data
  let today = null;
  try {
    const daily = path.join(POSSUM_RESULTS_DIR, 'possum_au_daily.json');
    if (fs.existsSync(daily)) today = JSON.parse(fs.readFileSync(daily, 'utf-8'));
  } catch {}
  if (!today && allDays.length) today = allDays[allDays.length - 1];

  const regime = today?.regime_state || {};
  const regimeTrend = regime.trend || '—';
  const avix = regime.a_vix != null ? Number(regime.a_vix).toFixed(2) : '—';
  const adx = regime.adx != null ? Number(regime.adx).toFixed(1) : '—';
  const todayPnl = today?.net_pnl ?? 0;
  const todayRet = today?.daily_return_pct ?? 0;

  // Regime badge color
  const regimeColors = { bull: '#10b981', bear: '#ef4444', range_bound: '#f59e0b' };
  const regimeColor = regimeColors[regimeTrend] || '#6b7280';

  // Leaderboard rows
  const lbRows = leaderboard.map(v => {
    const pnlC = v.totalPnl > 0 ? '#10b981' : v.totalPnl < 0 ? '#ef4444' : '#64647a';
    const avgC = v.avgPnl > 0 ? '#10b981' : v.avgPnl < 0 ? '#ef4444' : '#64647a';
    return `<tr>
      <td class="lb-rank">${medalFor(v.rank)}</td>
      <td class="lb-code"><span class="variant-badge">${v.code}</span></td>
      <td>${v.trades || '—'}</td>
      <td style="color:${pnlC};font-weight:600">${fmtAud(v.totalPnl)}</td>
      <td>${v.winRate !== '—' ? v.winRate + '%' : '—'}</td>
      <td style="color:${avgC}">${v.trades > 0 ? fmtAud(v.avgPnl) : '—'}</td>
    </tr>`;
  }).join('');

  // Today's signals
  const positions = today?.positions || [];
  const signalRows = positions.length ? positions.map(p => {
    const dirColor = p.direction === 'buy' ? '#10b981' : '#ef4444';
    const conv = p.grok_conviction != null ? (Number(p.grok_conviction) * 100).toFixed(0) + '%' : '—';
    const rationale = (p.grok_rationale || '').slice(0, 120) + ((p.grok_rationale || '').length > 120 ? '…' : '');
    const pnlC = (p.net_pnl || 0) > 0 ? '#10b981' : (p.net_pnl || 0) < 0 ? '#ef4444' : '#64647a';
    return `<tr>
      <td class="sig-ticker">${p.ticker}</td>
      <td><span class="dir-badge" style="color:${dirColor};border-color:${dirColor}40;background:${dirColor}12">${p.direction?.toUpperCase()}</span></td>
      <td style="color:${pnlC};font-weight:600">${fmtAud(p.net_pnl || 0)}</td>
      <td>${conv}</td>
      <td><span class="variant-badge">${p.primary_variant || '—'}</span></td>
      <td class="rationale">${rationale}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="empty-cell">No signals today</td></tr>';

  // Recent history (last 14 days)
  const recent = [...allDays].reverse().slice(0, 14);
  const histRows = recent.map(d => {
    const pnlC = (d.net_pnl || 0) > 0 ? '#10b981' : (d.net_pnl || 0) < 0 ? '#ef4444' : '#64647a';
    const retC = (d.daily_return_pct || 0) > 0 ? '#10b981' : (d.daily_return_pct || 0) < 0 ? '#ef4444' : '#64647a';
    const r = d.regime_state?.trend || '—';
    const rc = regimeColors[r] || '#6b7280';
    return `<tr>
      <td>${d.date}</td>
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
    <div class="header-right">
      <div class="live"><div class="dot-pulse"></div> PAPER mode</div>
      <a href="/" class="btn">← War Room</a>
      <a href="/possum-au" class="btn" style="color:#34d399;border-color:#34d39940;background:#34d39915">🦘 Possum AU</a>
      <a href="/possum-us" class="btn" style="color:#3b82f6;border-color:#3b82f640">🇺🇸 Possum US</a>
      <a href="/possum-crypto" class="btn" style="color:#f59e0b;border-color:#f59e0b40">₿ Crypto</a>
      <a href="/possum-pm" class="btn" style="color:#a78bfa;border-color:#a78bfa40">🎯 Possum PM</a>
      <a href="/leaderboard" class="btn" style="color:#fbbf24;border-color:#fbbf2440">🏆 Leaderboard</a>
      <a href="/possum-au" class="btn" style="color:#999;border-color:#99999940" title="Refresh">↻</a>
    </div>
  </header>

  <div class="content">

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
        <div class="stat-sub">${compLive ? (today?.date || '—') : '—'}</div>
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
        <div class="stat-label">Today's Trades</div>
        <div class="stat-value green">${compLive ? (today?.num_trades ?? '—') : '0'}</div>
        <div class="stat-sub">Signals generated</div>
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
              <th>Win Rate</th>
              <th>Avg P&amp;L</th>
            </tr>
          </thead>
          <tbody>${lbRows}</tbody>
        </table>
      </div>
    </section>

    <!-- Today's Signals -->
    <section class="section">
      <h2 class="section-title">📡 Today's Signals — ${today?.date || 'N/A'}</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Direction</th>
              <th>P&amp;L</th>
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
  const compLive = isCompetitionActive();
  const data = await getPossumUSData();
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

  const pclr = (n) => n > 0 ? '#10b981' : n < 0 ? '#ef4444' : '#64647a';
  const statusColor = botStatus === 'ACTIVE' ? '#10b981' : '#ef4444';
  const regimeColor = /bull/i.test(regime) ? '#10b981' : /bear/i.test(regime) ? '#ef4444' : '#f59e0b';

  // Variant leaderboard rows
  const variantRows = variants.map((v, i) => {
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
    return `<tr style="${isActive ? 'background:#10b98106;' : ''}">
      <td class="lb-rank">${medal}</td>
      <td><span class="variant-badge">${v.code}</span></td>
      <td class="lb-name">${v.name || v.code}</td>
      <td>${activeCell}</td>
      <td>${v.trades ?? 0}</td>
      <td style="color:${pnlC};font-weight:600">${fmtUsd(v.pnl ?? 0)}</td>
      <td>${winRate}</td>
      <td>${pf}</td>
      <td style="color:var(--muted);font-size:0.75rem">${avgHold}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="empty-cell">No variant data</td></tr>';

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
    <div class="header-right">
      <div class="live"><div class="dot-pulse"></div> ${botStatus}</div>
      <a href="/" class="btn">← War Room</a>
      <a href="/possum-au" class="btn" style="color:#34d399;border-color:#34d39940">🦘 Possum AU</a>
      <a href="/possum-us" class="btn" style="color:#3b82f6;border-color:#3b82f640;background:#3b82f615">🇺🇸 Possum US</a>
      <a href="/possum-crypto" class="btn" style="color:#f59e0b;border-color:#f59e0b40">₿ Crypto</a>
      <a href="/possum-pm" class="btn" style="color:#a78bfa;border-color:#a78bfa40">🎯 Possum PM</a>
      <a href="/leaderboard" class="btn" style="color:#fbbf24;border-color:#fbbf2440">🏆 Leaderboard</a>
      <a href="/possum-us" class="btn" style="color:#999;border-color:#99999940" title="Refresh">↻</a>
    </div>
  </header>

  <div class="content">
    ${!data ? `<div class="error-banner">⚠️ Could not reach Possum US API at http://localhost:8080/api/status — bot may be offline or API not running.</div>` : ''}

    <!-- Hero Stats -->
    <div class="hero">
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💵</div>
        <div class="stat-label">Capital</div>
        <div class="stat-value blue">$9,500</div>
        <div class="stat-sub">Competition cap (~A$15k)</div>
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
      <div class="stat-card" data-g="${botStatus === 'ACTIVE' ? 'green' : 'red'}">
        <div class="stat-icon">🤖</div>
        <div class="stat-label">Bot Status</div>
        <div class="stat-value" style="color:${statusColor};font-size:0.9rem">${botStatus}</div>
        <div class="stat-sub">${activeVariants.length} active variant${activeVariants.length !== 1 ? 's' : ''}</div>
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
              <th>Win Rate</th>
              <th>Profit Factor</th>
              <th>Avg Hold</th>
            </tr>
          </thead>
          <tbody>${variantRows}</tbody>
        </table>
      </div>
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

app.get('/possum-crypto', (req, res) => {
  const compLive = isCompetitionActive();
  const dbExists = fs.existsSync(CRYPTO_DB);

  // Fetch data
  const regimeRows = cryptoQuery('SELECT * FROM crypto_regime_log ORDER BY timestamp_utc DESC LIMIT 1');
  const regime = regimeRows[0] || {};

  const openPositions = cryptoQuery("SELECT * FROM positions WHERE status='open' ORDER BY entry_timestamp_utc DESC");
  const closedPositions = cryptoQuery("SELECT * FROM positions WHERE status='closed' ORDER BY close_timestamp_utc DESC LIMIT 10");
  const recentSignals = cryptoQuery('SELECT * FROM crypto_signals ORDER BY timestamp_utc DESC LIMIT 15');
  const recentTrades = cryptoQuery('SELECT * FROM trades ORDER BY timestamp_utc DESC LIMIT 10');
  const dailyPnl = cryptoQuery('SELECT * FROM daily_pnl ORDER BY date DESC LIMIT 14');
  const apiCosts = cryptoQuery("SELECT SUM(estimated_cost_usd) as total, SUM(input_tokens) as tin, SUM(output_tokens) as tout FROM api_costs WHERE timestamp_utc >= datetime('now', '-7 days')");

  const leaderboard = buildCryptoLeaderboard(recentSignals);

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
    const ts = t.timestamp_utc ? t.timestamp_utc.slice(0,16).replace('T',' ')+' UTC' : '—';
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
      <td style="font-size:0.7rem;color:var(--muted)">${(p.close_timestamp_utc||'').slice(0,10)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="empty-cell">No closed positions yet</td></tr>';

  // Variant leaderboard rows
  const lbRows = leaderboard.map((v,i) => {
    const medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
    return `<tr>
      <td class="lb-rank">${medal}</td>
      <td><span class="variant-badge">${v.code}</span></td>
      <td>${v.signals||0}</td>
      <td>${v.executed||0}</td>
    </tr>`;
  }).join('');

  // API cost
  const cost = apiCosts[0] || {};
  const totalCost = cost.total ? `$${Number(cost.total).toFixed(4)} USD` : 'A$0.00';

  const assetCards = ['BTC/AUD','ETH/AUD','SOL/AUD'].map(sym => {
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
  <div class="header-right">
    <div class="live"><div class="dot-pulse"></div> PAPER mode</div>
    <a href="/" class="btn">← War Room</a>
    <a href="/possum-au" class="btn" style="color:#34d399;border-color:#34d39940">🦘 Possum AU</a>
    <a href="/possum-us" class="btn" style="color:#3b82f6;border-color:#3b82f640">🇺🇸 Possum US</a>
    <a href="/possum-crypto" class="btn" style="color:#f59e0b;border-color:#f59e0b40;background:#f59e0b15">₿ Crypto</a>
    <a href="/possum-pm" class="btn" style="color:#a78bfa;border-color:#a78bfa40">🎯 Possum PM</a>
    <a href="/leaderboard" class="btn" style="color:#fbbf24;border-color:#fbbf2440">🏆 Leaderboard</a>
    <a href="/possum-crypto" class="btn" style="color:#999;border-color:#99999940" title="Refresh">↻</a>
  </div>
</header>

  <div class="content">
    ${!dbExists ? '<div class="error-banner">⚠️ Crypto DB not found at expected path.</div>' : ''}

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
        <div class="stat-sub">of 3 assets</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">🔢</div>
        <div class="stat-label">Total Trades</div>
        <div class="stat-value amber">${compLive ? (recentTrades.length > 0 ? recentTrades.length + '+' : '0') : '0'}</div>
        <div class="stat-sub">last 10 shown</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💸</div>
        <div class="stat-label">API Cost (7d)</div>
        <div class="stat-value blue" style="font-size:1rem">${totalCost}</div>
        <div class="stat-sub">Grok / xAI</div>
      </div>
      <div class="stat-card" data-g="green">
        <div class="stat-icon">🧬</div>
        <div class="stat-label">Variants</div>
        <div class="stat-value green">9</div>
        <div class="stat-sub">M1-3 · MR1-3 · S1-3</div>
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
      <h2 class="section-title">🏆 Variant Activity</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Rank</th><th>Variant</th><th>Signals</th><th>Executed</th></tr></thead>
          <tbody>${lbRows}</tbody>
        </table>
      </div>
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

<script>setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`);
});

// ── Possum PM Route ────────────────────────────────────────────────────────────
app.get('/possum-pm', (req, res) => {
  const compLive = isCompetitionActive();
  const dbExists = fs.existsSync(PM_DB);
  const contractsRaw = fs.existsSync(PM_CONTRACTS_FILE) ? JSON.parse(fs.readFileSync(PM_CONTRACTS_FILE, 'utf-8')) : [];
  const contracts = contractsRaw.filter(c => c.active !== false);

  // Stats
  const openTrades = dbExists ? pmQuery("SELECT COUNT(*) as n FROM pm_trades WHERE status='open'")[0]?.n || 0 : 0;
  const totalDecisions = dbExists ? pmQuery("SELECT COUNT(*) as n FROM pm_decisions")[0]?.n || 0 : 0;
  const totalTrades = dbExists ? pmQuery("SELECT COUNT(*) as n FROM pm_trades")[0]?.n || 0 : 0;
  const apiCost7d = dbExists ? pmQuery(`SELECT ROUND(SUM(estimated_cost_usd),4) as c FROM api_costs WHERE timestamp_utc >= datetime('now','-7 days')`)[0]?.c || 0 : 0;

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

    const lastSeen = d ? `<span style="font-size:0.65rem;color:#64647a">${d.timestamp_utc?.slice(0,16).replace('T',' ')} UTC</span>` : '<span style="color:#64647a;font-size:0.7rem">No data yet</span>';

    return `
    <div style="background:#0d0d1a;border:1px solid ${cardBorder};border-radius:12px;padding:18px 20px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">
        <div>
          <div style="font-weight:600;font-size:0.95rem;color:#e0e0f0">${c.name}${statusDot}</div>
          <div style="font-size:0.7rem;color:#64647a;margin-top:2px">Resolves: ${c.resolution_date} · ID: ${c.id}</div>
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
      <td style="color:#64647a;font-size:0.7rem">${(d.timestamp_utc||'').slice(0,16).replace('T',' ')}</td>
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
    const gapF = t.manifold_probability != null && t.polymarket_price != null
      ? Math.abs((Number(t.manifold_probability) * 100) - (Number(t.polymarket_price) * 100)).toFixed(1) + 'pp' : '—';
    return `<tr>
      <td style="color:#64647a;font-size:0.7rem">${(t.timestamp_utc||'').slice(0,16).replace('T',' ')}</td>
      <td style="font-size:0.8rem">${t.contract_name||t.contract_id}</td>
      <td><span style="color:${dirColor};background:${dirColor}20;padding:2px 8px;border-radius:4px;font-weight:700;font-size:0.75rem">${(t.direction||'').toUpperCase()}</span></td>
      <td>${t.polymarket_price != null ? '$' + Number(t.polymarket_price).toFixed(3) : '—'}</td>
      <td>${t.manifold_probability != null ? (Number(t.manifold_probability)*100).toFixed(1)+'%' : '—'}</td>
      <td>${gapF}</td>
      <td>${t.grok_confidence != null ? (Number(t.grok_confidence)*100).toFixed(0)+'%' : '—'}</td>
      <td style="font-size:0.75rem;color:#a78bfa">${t.grok_action||'—'}</td>
      <td>${t.suggested_entry != null ? '$' + Number(t.suggested_entry).toFixed(3) : '—'}</td>
      <td>${t.suggested_exit != null ? '$' + Number(t.suggested_exit).toFixed(3) : '—'}</td>
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
  <div class="header-right">
    <div class="live"><div class="dot-pulse"></div> PAPER mode</div>
    <a href="/" class="btn">← War Room</a>
    <a href="/possum-au" class="btn" style="color:#34d399;border-color:#34d39940">🦘 Possum AU</a>
    <a href="/possum-us" class="btn" style="color:#3b82f6;border-color:#3b82f640">🇺🇸 Possum US</a>
    <a href="/possum-crypto" class="btn" style="color:#f59e0b;border-color:#f59e0b40">₿ Crypto</a>
    <a href="/possum-pm" class="btn" style="color:#a78bfa;border-color:#a78bfa40;background:#a78bfa15">🎯 Possum PM</a>
    <a href="/leaderboard" class="btn" style="color:#fbbf24;border-color:#fbbf2440">🏆 Leaderboard</a>
    <a href="/possum-pm" class="btn" style="color:#999;border-color:#99999940" title="Refresh">↻</a>
  </div>
</header>

  <div class="content">
    ${!dbExists ? '<div class="error-banner">⚠️ Possum PM DB not found. Run the bot at least once.</div>' : ''}

    <!-- Hero Stats -->
    <div class="hero">
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💵</div>
        <div class="stat-label">Capital</div>
        <div class="stat-value blue">A$15,000</div>
        <div class="stat-sub">Competition cap</div>
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
            <th>Time</th><th>Contract</th><th>Direction</th><th>PM Price</th>
            <th>Manifold %</th><th>Gap pp</th><th>Grok Conf</th>
            <th>Grok Action</th><th>Entry</th><th>Exit</th>
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
              <td style="color:#64647a;font-size:0.7rem">${(a.timestamp_utc||'').slice(0,16).replace('T',' ')}</td>
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

app.get('/leaderboard', async (req, res) => {
  const data = await getLeaderboardData();
  const bots = data?.ranked || [];
  const competition = data?.competition || {};
  const compActive = competition.active || false;
  const today = data?.today || new Date().toISOString().slice(0, 10);
  const timestamp = data?.timestamp || new Date().toISOString();
  const history = data?.history || [];
  const score = data?.score || {};
  const feeDrag = data?.fee_drag || {};

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
    const ret = compActive ? b.competition_return : b.cumulative_pct;
    const retStr = fmtPct(ret);
    const retColor = pnlColor(ret);
    const regime = b.regime || '—';
    const dailyPnl = b.daily_pnl;
    const dailyCurr = b.currency_label === 'USD' ? '$' : 'A$';
    const trades = b.total_trades ?? 0;
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

  // Competition info
  const daysLeft = competition.days_remaining;
  const compBanner = compActive
    ? `<div class="comp-banner green">🏁 Competition Active — Started ${competition.start_date || '—'} · Ends ${competition.end_date || '—'}${daysLeft != null ? ' · ' + daysLeft + ' days remaining' : ''}</div>`
    : `<div class="comp-banner amber">⏳ Competition starts ${competition.start_date || 'soon'} — All bots racing on A$15,000 starting capital</div>`;

  // Chart data (history)
  const chartLabels = history.map(h => `"${h.date?.slice(5) || ''}"`).join(',');
  const chartUS = history.map(h => h.us_cumulative ?? 'null').join(',');
  const chartAU = history.map(h => h.au_cumulative ?? 'null').join(',');
  const hasChart = history.length > 1;

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

    /* Chart */
    .chart-wrap {
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--r); padding: 20px; margin-bottom: 36px;
    }
    .chart-wrap canvas { width: 100% !important; }
    .chart-legend { display: flex; gap: 20px; margin-top: 12px; flex-wrap: wrap; }
    .chart-legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--muted); }
    .chart-legend-dot { width: 8px; height: 8px; border-radius: 50%; }

    /* Two column layout */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media (max-width: 900px) { .two-col { grid-template-columns: 1fr; } }

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
    <div class="header-right">
      <div class="live"><div class="dot-pulse"></div> Auto-refresh 30s</div>
      <a href="/" class="btn">← War Room</a>
      <a href="/possum-au" class="btn" style="color:#34d399;border-color:#34d39940">🦘 Possum AU</a>
      <a href="/possum-us" class="btn" style="color:#3b82f6;border-color:#3b82f640">🇺🇸 Possum US</a>
      <a href="/possum-crypto" class="btn" style="color:#f59e0b;border-color:#f59e0b40">₿ Crypto</a>
      <a href="/possum-pm" class="btn" style="color:#a78bfa;border-color:#a78bfa40">🎯 Possum PM</a>
      <a href="/leaderboard" class="btn" style="color:#fbbf24;border-color:#fbbf2440;background:#fbbf2415">🏆 Leaderboard</a>
      <a href="/leaderboard" class="btn" style="color:#999;border-color:#99999940" title="Refresh">↻</a>
    </div>
  </header>

  <div class="content">

    ${compBanner}

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
        <div class="stat-sub">of 4 bots</div>
      </div>
      <div class="stat-card" data-g="amber">
        <div class="stat-icon">📅</div>
        <div class="stat-label">${compActive ? 'Days Left' : 'Starts In'}</div>
        <div class="stat-value amber">${daysLeft != null ? daysLeft : '—'}</div>
        <div class="stat-sub">${competition.start_date || '—'} → ${competition.end_date || '—'}</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">⚔️</div>
        <div class="stat-label">US vs AU Score</div>
        <div class="stat-value blue" style="font-size:1rem">${score.us_wins ?? 0} - ${score.draws ?? 0} - ${score.au_wins ?? 0}</div>
        <div class="stat-sub">${score.total ?? 0} trading days</div>
      </div>
      <div class="stat-card" data-g="blue">
        <div class="stat-icon">💰</div>
        <div class="stat-label">Fee Drag Today</div>
        <div class="stat-value blue" style="font-size:1rem">${feeDrag.us_fees_today != null ? '$' + Number(feeDrag.us_fees_today).toFixed(2) : '—'} / ${feeDrag.au_fees_today != null ? 'A$' + Number(feeDrag.au_fees_today).toFixed(2) : '—'}</div>
        <div class="stat-sub">US / AU fees</div>
      </div>
    </div>

    <!-- Scoreboard Table -->
    <section class="section">
      <h2 class="section-title">🏆 Scoreboard</h2>
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
    ${hasChart ? `
    <section class="section">
      <h2 class="section-title">📈 Performance Over Time</h2>
      <div class="chart-wrap">
        <canvas id="perfChart" height="220"></canvas>
        <div class="chart-legend">
          <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#3b82f6"></div> Possum US</div>
          <div class="chart-legend-item"><div class="chart-legend-dot" style="background:#34d399"></div> Possum AU</div>
        </div>
      </div>
    </section>
    ` : ''}

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

  </div>
</div>

${hasChart ? `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
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

<script>setTimeout(() => location.reload(), 30000);</script>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🛸 War Room → http://localhost:${PORT}`);
  console.log(`🌐 Network  → http://192.168.68.70:${PORT}`);
});
