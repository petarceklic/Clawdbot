#!/usr/bin/env node
// Woolworths cart automation — navigates shadow DOM to click "Add to cart"
// Structure: wc-product-tile.shadowRoot → wc-add-to-cart.shadowRoot → button.add-to-cart-btn

const CDP_WS = 'ws://127.0.0.1:18800/devtools/page/38A543868633F604162028A8E8054E59';

// Items to add. tileIndex = which search result to pick (0-based, skips sponsored)
// For plums: pick highest price. For apples: pick best quality (Pink Lady).
const ITEMS = [
  { term: 'macro organic plain flour', tileIndex: 0, note: 'organic flour' },
  { term: 'macro organic self raising flour', tileIndex: 0, note: 'organic SR flour' },
  { term: 'macro organic soy milk 1l', tileIndex: 0, note: 'soy milk' },
  { term: 'low fat cottage cheese', tileIndex: 0, note: 'cottage cheese' },
  { term: 'woolworths high protein plain yogurt', tileIndex: 0, note: 'protein yogurt' },
  { term: 'woolworths frozen peas', tileIndex: 1, note: 'cheapest frozen peas — pick WW brand' },
  { term: 'konjac noodles', tileIndex: 0, note: 'konjac noodles' },
  { term: 'fresh broccoli', tileIndex: 0, qty: 2, note: 'broccoli x2' },
  { term: 'pink lady apples', tileIndex: 0, qty: 5, note: 'best quality apples x5' },
  { term: 'blood plums', tileIndex: 0, note: 'plums — pick best/highest price option' },
  { term: 'weet-bix honey bites', tileIndex: 0, note: 'weetbix honey bites' },
  { term: 'temptations cat treats chicken', tileIndex: 0, note: 'cat treats - chicken flavor' },
  { term: 'temptations cat treats seafood', tileIndex: 0, note: 'cat treats - seafood flavor' },
  { term: 'red seedless watermelon', tileIndex: 0, note: 'whole watermelon' },
  { term: 'sliced mushrooms', tileIndex: 0, note: 'sliced mushrooms' },
  { term: 'sanitarium satay tofu', tileIndex: 0, note: 'satay tofu' },
  { term: 'firm tofu', tileIndex: 0, note: 'plain firm tofu' },
];

let msgId = 1;
const pending = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));

function cdpSend(ws, method, params = {}) {
  return new Promise((resolve) => {
    const id = msgId++;
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); resolve({ result: { result: { value: 'timeout' } } }); } }, 20000);
  });
}

async function evalJS(ws, expression) {
  const r = await cdpSend(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
}

async function navigate(ws, url) {
  // Use CDP directly
  await cdpSend(ws, 'Page.navigate', { url });
  // Wait for page to settle
  await sleep(5000);
}

async function getProductInfo(ws, tileIndex) {
  // Get product name and price from the nth tile (skipping promoted/shop-now tiles)
  return evalJS(ws, `
    (() => {
      const wcTiles = document.querySelectorAll('wc-product-tile');
      let productTiles = [];
      for (const tile of wcTiles) {
        const sr = tile.shadowRoot;
        if (!sr) continue;
        const addToCart = sr.querySelector('wc-add-to-cart');
        if (!addToCart?.shadowRoot?.querySelector('button.add-to-cart-btn')) continue;
        const name = sr.querySelector('a[class*=""]')?.innerText?.trim() || '';
        const price = sr.querySelector('[class*="price"]')?.innerText?.trim() || '';
        const label = addToCart.shadowRoot.querySelector('button.add-to-cart-btn')?.getAttribute('aria-label') || '';
        productTiles.push({ name, price, label });
      }
      const tile = productTiles[${tileIndex}];
      return JSON.stringify({ total: productTiles.length, tile });
    })()
  `);
}

async function addToCart(ws, tileIndex) {
  return evalJS(ws, `
    (() => {
      const wcTiles = document.querySelectorAll('wc-product-tile');
      let productTiles = [];
      for (const tile of wcTiles) {
        const sr = tile.shadowRoot;
        if (!sr) continue;
        const addToCart = sr.querySelector('wc-add-to-cart');
        const btn = addToCart?.shadowRoot?.querySelector('button.add-to-cart-btn');
        if (!btn) continue;
        productTiles.push({ tile, btn, label: btn.getAttribute('aria-label') });
      }
      const target = productTiles[${tileIndex}];
      if (!target) return 'no-tile-at-index-' + ${tileIndex} + '-of-' + productTiles.length;
      target.btn.click();
      return 'clicked: ' + target.label;
    })()
  `);
}

async function incrementQty(ws, tileIndex, times) {
  for (let i = 0; i < times; i++) {
    await sleep(1500);
    await evalJS(ws, `
      (() => {
        const wcTiles = document.querySelectorAll('wc-product-tile');
        let idx = 0;
        for (const tile of wcTiles) {
          const sr = tile.shadowRoot;
          if (!sr) continue;
          const atc = sr.querySelector('wc-add-to-cart');
          const atcSR = atc?.shadowRoot;
          if (!atcSR) continue;
          // After clicking, "Add to cart" becomes a +/- counter
          // The increment button
          const incBtn = atcSR.querySelector('button[aria-label*="increase"], button[aria-label*="Increase"], button[class*="increment"], button[class*="plus"]');
          if (incBtn && idx === ${tileIndex}) { incBtn.click(); return 'incremented'; }
          idx++;
        }
        return 'no increment button';
      })()
    `);
  }
}

async function main() {
  console.log('🛒 Woolworths order automation starting...\n');

  const ws = new WebSocket(CDP_WS);
  ws.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.id && pending.has(data.id)) { const { resolve } = pending.get(data.id); pending.delete(data.id); resolve(data); }
    } catch {}
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', (e) => reject(new Error('WS error')));
    setTimeout(() => reject(new Error('connect timeout')), 10000);
  });

  console.log('✅ CDP connected\n');
  await cdpSend(ws, 'Page.enable');
  await cdpSend(ws, 'Runtime.enable');

  const results = [];

  for (const item of ITEMS) {
    console.log(`\n🔍 ${item.note} — searching: "${item.term}"`);
    const url = `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(item.term)}`;
    await navigate(ws, url);

    const infoRaw = await getProductInfo(ws, item.tileIndex || 0);
    let info = {};
    try { info = JSON.parse(infoRaw || '{}'); } catch {}
    console.log(`  Found ${info.total || 0} products. Target: ${JSON.stringify(info.tile)}`);

    const result = await addToCart(ws, item.tileIndex || 0);
    const ok = result && result.startsWith('clicked');
    console.log(`  ${ok ? '✅' : '❌'} ${result}`);
    results.push({ note: item.note, ok, result });

    // Handle qty > 1
    if (ok && item.qty && item.qty > 1) {
      await incrementQty(ws, item.tileIndex || 0, item.qty - 1);
    }
  }

  console.log('\n📋 Results:');
  results.forEach(r => console.log(`  ${r.ok ? '✅' : '❌'} ${r.note}: ${r.result}`));

  // Navigate to cart
  console.log('\n🛒 Going to cart...');
  await navigate(ws, 'https://www.woolworths.com.au/shop/cart');

  const cartSummary = await evalJS(ws, `
    (() => {
      const total = document.querySelector('[class*="TotalCost"], [class*="order-total"], [class*="subtotal"]')?.innerText?.trim();
      const header = document.querySelector('h1, [class*="cart-title"]')?.innerText?.trim();
      return JSON.stringify({total, header});
    })()
  `);
  console.log('Cart:', cartSummary);

  ws.close();
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
