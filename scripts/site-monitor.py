#!/Users/clawd/clawd/venvs/ring/bin/python3
"""
Site Monitor - Google Analytics + Search Console monitoring
Monitors petarceklic@gmail.com sites and alerts via Telegram on interesting changes.

Sites:
  GA:  ellenceklic.com (p445362232), petarceklic.com (p259097940)
  SC:  petarceklic.com, ellenceklic.com, thedatafusion.com, disruptis.io, travelabindex.com

Run: /Users/clawd/clawd/venvs/ring/bin/python3 /Users/clawd/clawd/scripts/site-monitor.py
"""

import json
import os
import re
import sys
import time
import requests
from datetime import datetime
from playwright.sync_api import sync_playwright

# ── Config ──────────────────────────────────────────────────────────────
TELEGRAM_BOT_TOKEN = "8268467563:AAE9I7Yxihn0020w99VyBNLdtYykdePOwCQ"
TELEGRAM_CHAT_ID   = "5897115037"
STATE_FILE         = "/Users/clawd/clawd/scripts/.site-monitor-state.json"
CDP_URL            = "http://127.0.0.1:18800"
BROWSER_CTRL_URL   = "http://127.0.0.1:18791"

GA_SITES = {
    "ellenceklic.com": {"account": "317517606", "property": "445362232"},
    "petarceklic.com": {"account": "184181667", "property": "259097940"},
}

SC_SITES = {
    "petarceklic.com":  "sc-domain:petarceklic.com",
    "ellenceklic.com":  "sc-domain:ellenceklic.com",
    "thedatafusion.com":"sc-domain:thedatafusion.com",
    "disruptis.io":     "https://www.disruptis.io/",
    "travelabindex.com":"https://www.travelabindex.com/",
}

# ── Helpers ──────────────────────────────────────────────────────────────
def send_telegram(message: str) -> bool:
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        r = requests.post(url, json={
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "Markdown"
        }, timeout=10)
        return r.ok
    except Exception as e:
        print(f"[telegram] error: {e}")
        return False

def load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except:
            pass
    return {"ga": {}, "sc": {}, "last_run": None}

def save_state(state: dict):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2, default=str)

def parse_number(s: str) -> float | None:
    """Parse a string like '1,234' or '5.6%' or '3.2' to a float."""
    if not s:
        return None
    s = s.strip().replace(",", "").replace("%", "").strip()
    try:
        return float(s)
    except:
        return None

def pct_change(new_val, old_val) -> float | None:
    if old_val is None or new_val is None or old_val == 0:
        return None
    return (new_val - old_val) / old_val * 100

def ensure_browser() -> bool:
    """Return True if Chrome CDP is reachable."""
    try:
        r = requests.get(f"{CDP_URL}/json/version", timeout=5)
        if r.ok:
            print("[browser] Chrome already running")
            return True
    except:
        pass

    # Try to start via Clawdbot control server
    print("[browser] Trying to start Chrome via Clawdbot control...")
    try:
        r = requests.post(f"{BROWSER_CTRL_URL}/browser/start",
                          json={"profile": "clawd"}, timeout=20)
        for _ in range(10):
            time.sleep(2)
            try:
                r2 = requests.get(f"{CDP_URL}/json/version", timeout=3)
                if r2.ok:
                    print("[browser] Chrome started")
                    return True
            except:
                pass
    except Exception as e:
        print(f"[browser] Could not start Chrome: {e}")
    return False

# ── GA extraction ────────────────────────────────────────────────────────
def extract_ga_metrics(page, site: str, account: str, property_id: str) -> dict:
    """
    Navigate to GA home for this property and extract key metrics.
    Returns dict with keys: active_users, event_count, new_users, sessions,
    top_channel, channels (dict), source (str).
    """
    url = (f"https://analytics.google.com/analytics/web/"
           f"#/a{account}p{property_id}/reports/intelligenthome")
    print(f"  GA {site}: navigating...")

    captured = {}

    def on_resp(response):
        """Intercept GA Data API calls."""
        u = response.url
        if ("analyticsdata.googleapis.com" in u or
                "analytics/w/" in u and "data" in u.lower()):
            try:
                body = response.json()
                key = u.split("?")[0].split("/")[-1]
                captured[key] = body
            except:
                pass

    page.on("response", on_resp)
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  GA {site}: navigation error: {e}")
        page.remove_listener("response", on_resp)
        return {}

    # Wait for GA to load its data
    page.wait_for_timeout(9000)
    page.remove_listener("response", on_resp)

    metrics = {"site": site, "source": "GA_DOM", "api_intercepts": len(captured)}

    try:
        # GA tabs: aria-label = "Active users 28, increased by 211.1%"
        tab_data = page.evaluate("""
            () => {
                const result = {};
                const tabs = document.querySelectorAll('[role="tab"]');
                tabs.forEach(t => {
                    const label = t.getAttribute('aria-label') || t.textContent || '';
                    // "Active users 28, increased by 211.1%"
                    // "New users 27, increased by 200.0%"
                    // "Event count 92, increased by 187.5%"
                    const m = label.match(/^(.+?)\\s+(\\d+(?:[,.]\\d+)*)(?:,\\s*(increased|decreased)\\s+by\\s+([\\d.]+)%)?/);
                    if (m) {
                        result[m[1].trim()] = {
                            value: parseFloat(m[2].replace(',','')),
                            direction: m[3] || null,
                            change_pct: m[4] ? (m[3] === 'decreased' ? -parseFloat(m[4]) : parseFloat(m[4])) : null
                        };
                    }
                });
                return result;
            }
        """)
        if tab_data:
            metrics["tab_data"] = tab_data
            for k, v in tab_data.items():
                if "active" in k.lower():
                    metrics["active_users"] = v["value"]
                    metrics["active_users_pct"] = v["change_pct"]
                elif "new" in k.lower():
                    metrics["new_users"] = v["value"]
                    metrics["new_users_pct"] = v["change_pct"]
                elif "event" in k.lower():
                    metrics["event_count"] = v["value"]
    except Exception as e:
        print(f"  GA {site}: tab parse error: {e}")

    try:
        # Extract channel/session data from table rows
        channel_data = page.evaluate("""
            () => {
                const channels = {};
                const rows = document.querySelectorAll('[role="row"]');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('[role="cell"], td');
                    if (cells.length >= 2) {
                        const label = cells[0].textContent.trim();
                        const value = cells[1].textContent.trim();
                        if (label && value && /^\\d/.test(value)) {
                            channels[label] = value;
                        }
                    }
                });
                return channels;
            }
        """)
        if channel_data:
            metrics["channels"] = channel_data
    except:
        pass

    # Check if page has "No data" error
    try:
        no_data = page.evaluate("""
            () => document.body.innerText.includes('No data received from your website')
        """)
        metrics["no_data"] = no_data
    except:
        pass

    print(f"  GA {site}: active_users={metrics.get('active_users')}, "
          f"new_users={metrics.get('new_users')}, "
          f"api_hits={metrics.get('api_intercepts', 0)}")
    return metrics


# ── SC extraction ─────────────────────────────────────────────────────────
def extract_sc_metrics(page, site: str, resource_id: str) -> dict:
    """
    Navigate to Search Console performance report and extract key metrics.
    Returns dict with: clicks, impressions, ctr, position, top_queries.
    """
    url = (f"https://search.google.com/search-console/performance/search-analytics"
           f"?resource_id={resource_id}")
    print(f"  SC {site}: navigating...")

    captured = {}

    def on_resp(response):
        u = response.url
        if "searchconsole.googleapis.com" in u or "googleapis.com/webmasters" in u:
            try:
                body = response.json()
                captured[u.split("?")[0]] = body
            except:
                pass

    page.on("response", on_resp)
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        print(f"  SC {site}: navigation error: {e}")
        page.remove_listener("response", on_resp)
        return {}

    # SC takes time to render data
    page.wait_for_timeout(12000)
    page.remove_listener("response", on_resp)

    metrics = {"site": site, "source": "SC_DOM", "api_intercepts": len(captured)}

    # Try to parse from intercepted API data first
    for url_key, body in captured.items():
        if "rows" in body or "clicks" in str(body):
            metrics["raw_api"] = str(body)[:500]
            # SC API returns: {"rows": [...], "responseAggregationType": "..."}
            if "rows" in body and body["rows"]:
                total_clicks = sum(r.get("clicks", 0) for r in body["rows"])
                total_impr = sum(r.get("impressions", 0) for r in body["rows"])
                total_ctr = sum(r.get("ctr", 0) for r in body["rows"]) / len(body["rows"]) if body["rows"] else 0
                total_pos = sum(r.get("position", 0) for r in body["rows"]) / len(body["rows"]) if body["rows"] else 0
                metrics["clicks"] = total_clicks
                metrics["impressions"] = total_impr
                metrics["ctr"] = round(total_ctr * 100, 2)
                metrics["position"] = round(total_pos, 1)
            break

    # DOM fallback - extract the summary cards
    if "clicks" not in metrics:
        try:
            sc_summary = page.evaluate("""
                () => {
                    const result = {};
                    
                    // SC performance page: summary header with 4 cards
                    // Labels: "Total clicks", "Total impressions", "Average CTR", "Average position"
                    const allText = document.body.innerText;
                    
                    // Extract summary card values using regex on full page text
                    const patterns = [
                        ['clicks',      /Total clicks\\s+([\\d,]+)/],
                        ['impressions', /Total impressions\\s+([\\d,]+)/],
                        ['ctr',         /Average CTR\\s+([\\d.]+%?)/],
                        ['position',    /Average position\\s+([\\d.]+)/],
                    ];
                    
                    for (const [key, pat] of patterns) {
                        const m = allText.match(pat);
                        if (m) result[key] = m[1];
                    }
                    
                    // Also try to find the metric cards by structure
                    const headers = ['Total clicks', 'Total impressions', 'Average CTR', 'Average position'];
                    for (const h of headers) {
                        // Find elements containing just this text
                        const els = [...document.querySelectorAll('*')].filter(
                            el => el.childElementCount === 0 && el.textContent.trim() === h
                        );
                        if (els.length > 0) {
                            const el = els[0];
                            // Value is usually a sibling or nearby element
                            const parent = el.closest('[class]');
                            if (parent) {
                                const nums = parent.parentElement 
                                    ? parent.parentElement.querySelectorAll('[class]') 
                                    : [];
                                // look for number-like text near this element
                                for (const n of nums) {
                                    const t = n.textContent.trim();
                                    if (t !== h && /^[\\d,]+(\\.\\d+)?%?$/.test(t)) {
                                        const lkey = h.toLowerCase().replace('total ', '').replace('average ', '').replace(' ', '_');
                                        result[lkey + '_card'] = t;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    
                    return result;
                }
            """)
            if sc_summary:
                metrics.update(sc_summary)
                if "clicks" in sc_summary:
                    metrics["clicks"] = parse_number(sc_summary["clicks"])
                if "impressions" in sc_summary:
                    metrics["impressions"] = parse_number(sc_summary["impressions"])
                if "ctr" in sc_summary:
                    metrics["ctr"] = parse_number(sc_summary["ctr"])
                if "position" in sc_summary:
                    metrics["position"] = parse_number(sc_summary["position"])
        except Exception as e:
            print(f"  SC {site}: DOM parse error: {e}")

    # Try to extract top queries
    try:
        top_queries = page.evaluate("""
            () => {
                // SC performance table - look for query rows
                const rows = document.querySelectorAll('table tbody tr, [role="row"]');
                const queries = [];
                rows.forEach((row, i) => {
                    if (i > 10) return;
                    const cells = row.querySelectorAll('td, [role="cell"]');
                    if (cells.length >= 2) {
                        const query = cells[0].textContent.trim();
                        const clicks = cells[1].textContent.trim();
                        if (query && clicks && query.length < 100) {
                            queries.push({query, clicks});
                        }
                    }
                });
                return queries.slice(0, 10);
            }
        """)
        if top_queries:
            metrics["top_queries"] = top_queries
    except:
        pass

    # Check if SC shows "No data" or access error
    try:
        page_text = page.evaluate("() => document.body.innerText.substring(0, 2000)")
        if "No data" in page_text or "not a verified owner" in page_text or "Access denied" in page_text:
            metrics["error"] = "no_access_or_no_data"
        metrics["page_text_preview"] = page_text[:300]
    except:
        pass

    print(f"  SC {site}: clicks={metrics.get('clicks')}, impressions={metrics.get('impressions')}, "
          f"ctr={metrics.get('ctr')}, position={metrics.get('position')}, "
          f"api_hits={metrics.get('api_intercepts', 0)}")
    return metrics


# ── Analysis & alerts ─────────────────────────────────────────────────────
def analyze_changes(site: str, curr: dict, prev: dict, kind: str) -> list[str]:
    """Compare current vs previous metrics and return alert strings."""
    alerts = []

    if kind == "ga":
        # Active users
        new_au = curr.get("active_users")
        old_au = prev.get("active_users")
        chg = pct_change(new_au, old_au)
        if chg is not None and abs(chg) >= 50:
            icon = "📈" if chg > 0 else "📉"
            alerts.append(f"{icon} *{site} GA* active users {chg:+.0f}% WoW "
                          f"({int(old_au)} → {int(new_au)})")

        # New channels appearing in channels dict
        new_channels = set(curr.get("channels", {}).keys())
        old_channels = set(prev.get("channels", {}).keys())
        appeared = new_channels - old_channels
        for ch in appeared:
            alerts.append(f"🆕 *{site} GA* new traffic channel appeared: `{ch}`")

    elif kind == "sc":
        # Clicks
        new_cl = curr.get("clicks")
        old_cl = prev.get("clicks")
        chg = pct_change(new_cl, old_cl)
        if chg is not None and abs(chg) >= 30:
            icon = "📈" if chg > 0 else "📉"
            alerts.append(f"{icon} *{site} SC* clicks {chg:+.0f}% WoW "
                          f"({int(old_cl)} → {int(new_cl)})")

        # New top queries appearing
        new_qs = {q["query"] for q in curr.get("top_queries", [])}
        old_qs = {q["query"] for q in prev.get("top_queries", [])}
        appeared = new_qs - old_qs
        for q in list(appeared)[:3]:
            alerts.append(f"🆕 *{site} SC* new top query: `{q}`")

    return alerts


# ── Main ──────────────────────────────────────────────────────────────────
def run_monitor():
    print(f"\n{'='*60}")
    print(f" Site Monitor — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    state = load_state()
    prev_ga = state.get("ga", {})
    prev_sc = state.get("sc", {})

    all_alerts = []
    curr_ga = {}
    curr_sc = {}

    if not ensure_browser():
        msg = ("❌ *Site Monitor*: Chrome not reachable. "
               "Please ensure Clawdbot browser (profile=clawd) is running.")
        print(msg)
        send_telegram(msg)
        sys.exit(1)

    with sync_playwright() as p:
        try:
            browser = p.chromium.connect_over_cdp(CDP_URL)
            print(f"[browser] Connected to Chrome via CDP")
        except Exception as e:
            msg = f"❌ *Site Monitor*: Playwright CDP connect failed: {e}"
            print(msg)
            send_telegram(msg)
            sys.exit(1)

        # Reuse existing context (keeps cookies / logged-in state)
        contexts = browser.contexts
        if contexts:
            ctx = contexts[0]
        else:
            ctx = browser.new_context()

        page = ctx.new_page()
        page.set_default_timeout(35000)

        try:
            # ── Google Analytics ─────────────────────────────────────────
            print("\n[GA] Checking Google Analytics properties...")
            for site, cfg in GA_SITES.items():
                m = extract_ga_metrics(page, site, cfg["account"], cfg["property"])
                if m:
                    curr_ga[site] = m
                    alerts = analyze_changes(site, m, prev_ga.get(site, {}), "ga")
                    all_alerts.extend(alerts)

            # ── Search Console ────────────────────────────────────────────
            print("\n[SC] Checking Search Console properties...")
            for site, rid in SC_SITES.items():
                m = extract_sc_metrics(page, site, rid)
                if m:
                    curr_sc[site] = m
                    alerts = analyze_changes(site, m, prev_sc.get(site, {}), "sc")
                    all_alerts.extend(alerts)

        finally:
            page.close()

    # ── Save state ────────────────────────────────────────────────────────
    new_state = {
        "ga": curr_ga,
        "sc": curr_sc,
        "last_run": datetime.now().isoformat(),
    }
    save_state(new_state)
    print(f"\n[state] Saved to {STATE_FILE}")

    # ── Build report ──────────────────────────────────────────────────────
    now_str = datetime.now().strftime("%Y-%m-%d")

    if all_alerts:
        msg = f"🔔 *Site Monitor Alerts* — {now_str}\n\n"
        msg += "\n".join(all_alerts)
        print(f"\n[alert] {len(all_alerts)} alert(s):\n{msg}")
        send_telegram(msg)

    # Always send a weekly summary
    lines = [f"📊 *Weekly Site Check* — {now_str}\n"]

    for site, m in curr_ga.items():
        au = m.get("active_users")
        nu = m.get("new_users")
        lines.append(f"*{site} (GA)*: "
                     f"active={au or '?'}, new={nu or '?'}"
                     + (f", pct={m.get('active_users_pct'):+.0f}%" if m.get("active_users_pct") else ""))

    for site, m in curr_sc.items():
        cl = m.get("clicks")
        im = m.get("impressions")
        pos = m.get("position")
        err = m.get("error", "")
        if err:
            lines.append(f"*{site} (SC)*: {err}")
        else:
            lines.append(f"*{site} (SC)*: "
                         f"clicks={cl or '?'}, impr={im or '?'}, pos={pos or '?'}")

    if all_alerts:
        lines.append(f"\n⚠️ {len(all_alerts)} notable change(s) detected (see above)")
    else:
        lines.append("\n✅ No significant changes this week")

    summary = "\n".join(lines)
    print(f"\n[summary]\n{summary}")
    send_telegram(summary)

    print("\n[done] Monitor run complete.")
    return new_state


if __name__ == "__main__":
    run_monitor()
