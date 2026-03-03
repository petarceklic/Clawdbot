#!/usr/bin/env node
/**
 * grocery-automation.js
 * Sunday Night Grocery Automation for Clawdbot
 *
 * Modes:
 *   generate        — build list, message Ellen, save state
 *   deadline-check  — called at 9pm if no response, auto-place order
 *   place-order     — browser-automates Woolworths order placement
 *
 * State file: /Users/clawd/clawd/scripts/.grocery-state.json
 * Handler instructions: /Users/clawd/clawd/GROCERY_HANDLER.md
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────
const STATE_FILE   = path.join(__dirname, '.grocery-state.json');
const SHOPPING_MD  = '/Users/clawd/clawd/ellens_shopping_list.md';
const GATEWAY_URL  = 'http://localhost:18789';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || 'bb434449836e0a790303080bef3113bfbdb27c840b32195f';

const ELLEN_ID  = '8680578395';   // Telegram
const PETAR_ID  = '5897115037';   // Telegram

const WW_EMAIL    = 'eceklic@gmail.com';
const WW_PASS     = 'MOnday22';
const WW_ADDRESS  = '22 Franklin St, Leederville WA 6097';

// ─── Staples (derived from order history analysis) ───────────────────────────
// Items that appear 3+ times across the 10 most recent orders
const STAPLES = [
  { name: 'Fresh Broccoli',                     qty: 2 },
  { name: 'Woolworths Baby Leaf Spinach',        qty: 1 },
  { name: 'Cavendish Bananas',                   qty: 2 },
  { name: 'Eat Later Cavendish Bananas',         qty: 2 },
  { name: 'Apple Sundowner',                     qty: 3 },
  { name: 'Woolworths Qukes Baby Cucumbers Punnet', qty: 1 },
  { name: 'The Kimchi Company Vegan',            qty: 1 },
  { name: 'Woolworths Blue Washed Potato Bag',   qty: 1 },
  { name: 'The Odd Bunch Continental Cucumber',  qty: 1 },
];

// Protein options: prefer free-range chicken, suggest alternatives if expensive
const PROTEIN_OPTIONS = [
  { name: 'Macro Chicken Breast Fillets Free Range', qty: 1, type: 'chicken' },
  { name: 'Macro Free Range Chicken Drumsticks Free Range', qty: 2, type: 'chicken' },
  { name: 'Woolworths Health Smart Extra Lean Diced Beef', qty: 1, type: 'beef' },
  { name: 'Woolworths Lamb Leg Steak', qty: 1, type: 'lamb' },
];

// Conditional items: ONLY add if on special
const SPECIAL_ONLY = [
  'Temptations Cat Treats',
  'Churu Sprinkles Cat Treats',
  'Smitten Cat Milk',
  'Temptations Mix Ups Cat Treats',
  'Resolv Laundry Detergent Sheets',
  'Sukin',  // 1L body wash ONLY
];

// ─── State helpers ────────────────────────────────────────────────────────────
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Telegram send helper ─────────────────────────────────────────────────────
async function telegramSend(chatId, text) {
  const { default: fetch } = await import('node-fetch').catch(() => {
    // Fallback to built-in fetch (Node 18+)
    return { default: globalThis.fetch };
  });
  const res = await fetch(`${GATEWAY_URL}/api/message/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel: 'telegram',
      target: String(chatId),
      message: text,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Telegram send failed: ${res.status} ${body}`);
  return body;
}

// ─── Read Ellen's ad-hoc shopping list ───────────────────────────────────────
function readEllensList() {
  try {
    const md = fs.readFileSync(SHOPPING_MD, 'utf8');
    const items = [];
    let inPending = false;
    for (const line of md.split('\n')) {
      if (/^##\s*Pending/i.test(line)) { inPending = true; continue; }
      if (/^##/.test(line)) { inPending = false; continue; }
      if (inPending && /^-\s+/.test(line)) {
        const item = line.replace(/^-\s+/, '').trim();
        if (item) items.push(item);
      }
    }
    return items;
  } catch {
    return [];
  }
}

// ─── Build the draft grocery list ────────────────────────────────────────────
function buildGroceryList() {
  const items = [];

  // Staples
  for (const s of STAPLES) {
    items.push({ name: s.name, qty: s.qty, source: 'staple' });
  }

  // Default protein: free-range chicken breast (suggest alt if expensive)
  items.push({
    name: 'Macro Chicken Breast Fillets Free Range',
    qty: 1,
    source: 'protein',
    note: 'Skip if >$22/kg and suggest turkey wings or lean beef instead',
  });

  // Ellen's ad-hoc list
  const ellens = readEllensList();
  for (const e of ellens) {
    items.push({ name: e, qty: 1, source: 'ellens-list' });
  }

  // Conditional (special-only) — mark them clearly; the order-placement step
  // checks live prices before adding to cart
  items.push({ name: 'Cat food (Temptations or Churu)',       qty: 1, source: 'special-only', note: 'ADD ONLY IF ON SPECIAL' });
  items.push({ name: 'Resolv Laundry Detergent Sheets',       qty: 1, source: 'special-only', note: 'ADD ONLY IF ON SPECIAL' });
  items.push({ name: 'Sukin 1L Body Wash (NOT shampoo/conditioner)', qty: 1, source: 'special-only', note: 'ADD ONLY IF ON SPECIAL' });

  return items;
}

// ─── Format list for Telegram ─────────────────────────────────────────────────
function formatListForTelegram(items) {
  const lines = [];
  const staples    = items.filter(i => i.source === 'staple');
  const ellens     = items.filter(i => i.source === 'ellens-list');
  const protein    = items.filter(i => i.source === 'protein');
  const specials   = items.filter(i => i.source === 'special-only');

  if (protein.length) {
    lines.push('🥩 *Protein*');
    for (const i of protein) {
      lines.push(`  • ${i.name} ×${i.qty}${i.note ? `  _(${i.note})_` : ''}`);
    }
  }

  if (staples.length) {
    lines.push('\n🥦 *Staples*');
    for (const i of staples) {
      lines.push(`  • ${i.name} ×${i.qty}`);
    }
  }

  if (ellens.length) {
    lines.push('\n📝 *Your list*');
    for (const i of ellens) {
      lines.push(`  • ${i.name}`);
    }
  }

  if (specials.length) {
    lines.push('\n🏷️ *Only if on special*');
    for (const i of specials) {
      lines.push(`  • ${i.name}`);
    }
  }

  return lines.join('\n');
}

// ─── PHASE 1: Generate list and message Ellen ─────────────────────────────────
async function generate() {
  console.log('📋 Building grocery list...');
  const items = buildGroceryList();
  const formatted = formatListForTelegram(items);

  const msg = `Hey Ellen! 🛒 Here's your Woolworths order for Monday delivery:

${formatted}

Reply with any changes or additions, or say *"order it"* when you're happy and I'll place the order! 😊

_(If I don't hear back by 9pm I'll place it as-is)_`;

  console.log('📱 Messaging Ellen on Telegram...');
  await telegramSend(ELLEN_ID, msg);

  // Save state
  const now = Date.now();
  // Deadline = 9pm Perth = UTC+8, so 13:00 UTC same day
  // But just set it to 2 hours from now to be safe
  const deadline = now + 2 * 60 * 60 * 1000; // 9pm = 7pm + 2h

  const state = {
    status: 'pending',
    items,
    sentAt: now,
    deadline,
    version: 1,
  };
  saveState(state);
  console.log('✅ State saved. Waiting for Ellen\'s response.');
  console.log(`   Deadline: ${new Date(deadline).toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}`);
}

// ─── PHASE 2: Deadline check (called at 9pm if still pending) ─────────────────
async function deadlineCheck() {
  const state = loadState();
  if (!state.status || state.status === 'ordered') {
    console.log('No pending order or already ordered. Nothing to do.');
    return;
  }
  if (state.status === 'confirmed') {
    // Should already be ordering — something went wrong
    console.log('Order was confirmed but not placed. Placing now...');
    await placeOrder(state.items);
    return;
  }
  // Still pending — auto-place
  console.log('⏰ Deadline reached — auto-placing order...');
  await telegramSend(ELLEN_ID,
    "Hey Ellen! It's 9pm and I haven't heard back, so I'm going ahead and placing the Woolworths order now 🛒 I'll confirm when it's done!");
  await placeOrder(state.items);
}

// ─── PHASE 3: Place the Woolworths order (browser automation) ─────────────────
async function placeOrder(items) {
  // This function is called from GROCERY_HANDLER.md instructions via the main agent
  // when Ellen says "order it", OR from deadlineCheck at 9pm.
  //
  // The actual browser automation uses Clawdbot's browser tool (clawd profile).
  // This script writes a manifest for the agent to execute.

  const state = loadState();
  state.status = 'placing';
  state.placeStarted = Date.now();
  saveState(state);

  console.log('🛒 Woolworths order placement triggered.');
  console.log('   Items to order:');
  for (const item of (items || state.items || [])) {
    if (item.source === 'special-only') {
      console.log(`   [SPECIAL-ONLY] ${item.name} ×${item.qty || 1}`);
    } else {
      console.log(`   • ${item.name} ×${item.qty || 1}`);
    }
  }

  // Write an order manifest for the browser automation agent
  const manifest = {
    triggeredAt: new Date().toISOString(),
    account: { email: WW_EMAIL, password: WW_PASS },
    deliveryAddress: WW_ADDRESS,
    items: items || state.items || [],
    deliveryPreference: {
      day: 'Monday',
      fallbackDay: 'Tuesday',
      preferCheap: true,
      maxAcceptableSlotPrice: 5.00,
      note: 'Aim for $2 slot. Avoid $15 express. If Monday has no cheap slots, book Tuesday instead.',
    },
    specialOnlyItems: SPECIAL_ONLY,
    instructions: [
      '1. Log into woolworths.com.au with account credentials',
      '2. Clear any existing cart items',
      '3. For each item in the list:',
      '   a. Search for the item',
      '   b. Select the best match (prefer Macro/organic for produce, avoid highly processed)',
      '   c. For special-only items: only add if currently on special (check the price badge)',
      '   d. For protein: check price per kg — if chicken breast >$22/kg, add turkey wings or lean beef instead',
      '   e. For Sukin: 1L body wash ONLY (not shampoo, not conditioner)',
      '4. Proceed to checkout → delivery',
      '5. Enter delivery address if not pre-filled: 22 Franklin St, Leederville WA 6097',
      '6. Select Monday delivery slot with cheapest price (aim $2). If no cheap Monday slots, choose Tuesday',
      '7. Complete order (do not use express/priority delivery unless it is the only option and price is reasonable)',
      '8. Capture order confirmation number and total',
      '9. Call the confirmation function with results',
    ],
  };

  const manifestPath = path.join(__dirname, '.grocery-order-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`📄 Order manifest written to: ${manifestPath}`);
  console.log('   The main agent should now execute browser automation using this manifest.');
  console.log('   Run: node grocery-automation.js confirm-order <orderNumber> <total> <deliverySlot>');
}

// ─── Confirm order placed ─────────────────────────────────────────────────────
async function confirmOrder(orderNumber, total, deliverySlot) {
  const state = loadState();
  state.status = 'ordered';
  state.orderedAt = Date.now();
  state.orderNumber = orderNumber;
  state.orderTotal = total;
  state.deliverySlot = deliverySlot;
  saveState(state);

  const msg = `✅ Done! Woolworths order placed!\n\n📦 Order #${orderNumber}\n💰 Total: ${total}\n🚚 Delivery: ${deliverySlot}\n\nEnjoy your groceries Ellen! 😊`;
  const msgPetar = `🛒 Grocery order placed for Ellen!\n\nOrder #${orderNumber} — ${total}\nDelivery: ${deliverySlot}`;

  await telegramSend(ELLEN_ID, msg);
  await telegramSend(PETAR_ID, msgPetar);

  console.log('✅ Order confirmed and notifications sent.');
}

// ─── Handle Ellen's reply (called by GROCERY_HANDLER.md logic) ───────────────
async function handleReply(replyText) {
  const state = loadState();
  if (!state.status || state.status === 'ordered') {
    console.log('No pending order.');
    return { action: 'none' };
  }

  const normalized = replyText.toLowerCase().trim();
  const orderTriggers = ['order it', 'order', 'go ahead', 'yes', 'yep', 'do it', 'place it', 'ok', 'okay', "let's go", 'lets go', 'sounds good', 'perfect', 'great', '👍'];

  const isOrderConfirmation = orderTriggers.some(t => normalized.includes(t));

  if (isOrderConfirmation) {
    state.status = 'confirmed';
    saveState(state);
    return { action: 'place-order', items: state.items };
  }

  // Otherwise treat as a tweak — parse and update the list
  const tweaks = parseTweaks(replyText, state.items);
  state.items = tweaks.updatedItems;
  saveState(state);

  return { action: 'tweaked', updatedItems: tweaks.updatedItems, summary: tweaks.summary };
}

// ─── Parse tweaks from Ellen's reply ─────────────────────────────────────────
function parseTweaks(text, currentItems) {
  // Simple heuristic: look for "add X", "remove X", "no X", "skip X", "change X"
  const lines = text.split(/[,\n]+/).map(l => l.trim()).filter(Boolean);
  const updatedItems = [...currentItems];
  const changes = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Remove/skip
    if (/^(remove|no|skip|don'?t|delete|minus)\s+/i.test(line)) {
      const target = line.replace(/^(remove|no|skip|don'?t|delete|minus)\s+/i, '').trim();
      const idx = updatedItems.findIndex(i => i.name.toLowerCase().includes(target.toLowerCase()));
      if (idx >= 0) {
        changes.push(`Removed: ${updatedItems[idx].name}`);
        updatedItems.splice(idx, 1);
      }
    }
    // Add
    else if (/^(add|also|plus|\+)\s+/i.test(line)) {
      const target = line.replace(/^(add|also|plus|\+)\s+/i, '').trim();
      const exists = updatedItems.some(i => i.name.toLowerCase().includes(target.toLowerCase()));
      if (!exists) {
        updatedItems.push({ name: target, qty: 1, source: 'ellen-tweak' });
        changes.push(`Added: ${target}`);
      }
    }
    // Change qty: "2x broccoli" or "broccoli x3"
    else if (/\d+\s*x\s*/i.test(line) || /x\s*\d+/i.test(line)) {
      const qtyMatch = line.match(/(\d+)\s*x\s*(.+)|(.+)\s*x\s*(\d+)/i);
      if (qtyMatch) {
        const qty = parseInt(qtyMatch[1] || qtyMatch[4]);
        const name = (qtyMatch[2] || qtyMatch[3]).trim();
        const idx = updatedItems.findIndex(i => i.name.toLowerCase().includes(name.toLowerCase()));
        if (idx >= 0) {
          updatedItems[idx].qty = qty;
          changes.push(`Changed qty: ${updatedItems[idx].name} → ×${qty}`);
        } else {
          updatedItems.push({ name, qty, source: 'ellen-tweak' });
          changes.push(`Added: ${name} ×${qty}`);
        }
      }
    }
    // Plain item name (likely "add this")
    else if (line.length > 2 && line.length < 80) {
      const exists = updatedItems.some(i => i.name.toLowerCase().includes(line.toLowerCase()));
      if (!exists) {
        updatedItems.push({ name: line, qty: 1, source: 'ellen-tweak' });
        changes.push(`Added: ${line}`);
      }
    }
  }

  return { updatedItems, summary: changes.join(', ') || 'No changes detected' };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const [,, mode, ...args] = process.argv;

(async () => {
  try {
    switch (mode) {
      case 'generate':
        await generate();
        break;
      case 'deadline-check':
        await deadlineCheck();
        break;
      case 'place-order':
        await placeOrder(loadState().items);
        break;
      case 'confirm-order':
        await confirmOrder(args[0] || 'UNKNOWN', args[1] || '$0.00', args[2] || 'Monday');
        break;
      case 'handle-reply':
        const result = await handleReply(args.join(' '));
        console.log(JSON.stringify(result, null, 2));
        break;
      case 'status':
        const state = loadState();
        console.log(JSON.stringify(state, null, 2));
        break;
      default:
        console.error('Usage: grocery-automation.js <generate|deadline-check|place-order|confirm-order|handle-reply|status>');
        process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
})();
