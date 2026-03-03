# GROCERY_HANDLER.md — Ellen's Grocery Reply Handler

## Purpose
When Ellen messages the bot after the Sunday 7pm grocery list has been sent,
the bot needs to handle her response appropriately.

This file explains **how** to handle those replies.

---

## How to Detect a Grocery Conversation

When a message arrives from Telegram user **8680578395** (Ellen):

1. Read `/Users/clawd/clawd/scripts/.grocery-state.json`
2. If `status` is `"pending"` or `"confirmed"` → this is likely a grocery reply
3. Check if the message is about groceries:
   - Mentions food, items, order, Woolworths, delivery
   - Contains "order it", "go ahead", "yes", "looks good", a list of items, or modifications
   - **If in doubt and status is "pending"** → treat it as a grocery reply

---

## State Values

| Status      | Meaning                                              |
|-------------|------------------------------------------------------|
| `idle`      | No active grocery session                            |
| `pending`   | List sent to Ellen, awaiting her reply               |
| `confirmed` | Ellen approved — order needs to be placed            |
| `placing`   | Browser automation is running                        |
| `ordered`   | Order successfully placed                            |

---

## Phase 2 Response Handling

### When Ellen says "order it" (or equivalent)

Keywords: `order it`, `order`, `go ahead`, `yes`, `yep`, `do it`, `place it`, `ok`, `okay`, `let's go`, `sounds good`, `perfect`, `👍`

**Action:**
1. Reply to Ellen: "On it! Placing the order now 🛒"
2. Run the Woolworths order placement (see below)

---

### When Ellen makes tweaks

Examples: "add oat milk", "remove broccoli", "also get yoghurt", "no carrots", "2x spinach"

**Action:**
1. Parse her changes:
   - `add X` / `also X` / `+ X` → add to list
   - `remove X` / `no X` / `skip X` → remove from list
   - `Xx item` or `item Xx` → change quantity
   - Plain item name → add to list
2. Update the state file items
3. Reply with updated list:
   ```
   Updated! Here's the new list:
   [dot-point list]
   
   Say "order it" when you're ready 🛒
   ```

You can also run:
```bash
node /Users/clawd/clawd/scripts/grocery-automation.js handle-reply "her message text"
```
This returns JSON: `{ action: "tweaked"|"place-order", updatedItems: [...], summary: "..." }`

---

### When Ellen asks a question

If she asks "is X on special?" or "how much is Y?" — answer as best you can (you may need to check Woolworths website), then continue the conversation naturally.

---

## Substitution Rules
- **Fruit & Vegetables: NO substitutions** — if unavailable, leave it out. Do not accept Woolworths substitutes for produce.
- During checkout "Review your items" step, find each F&V item and set substitution preference to "No substitution" or equivalent.
- Other categories (pantry, dairy, etc.) can allow substitutions as normal.

---

## Woolworths Order Placement

When Ellen says "order it" OR when the 9pm deadline fires:

### Step-by-step browser automation

Use `browser` tool with `profile="clawd"` for all steps.

1. **Navigate to Woolworths**
   ```
   browser action=open profile=clawd url=https://www.woolworths.com.au
   ```

2. **Log in** (if not already logged in)
   - Click "Log in" button
   - Email: `eceklic@gmail.com`
   - Password: `MOnday22`

3. **Clear existing cart** (if any items)
   - Go to cart, remove all items

4. **Add each item**
   For each item in `state.items`:
   - Search for the item name
   - Select best match (prefer Macro/organic, avoid highly processed)
   - **Special-only items**: Check if there's a "Special" or "SAVE" badge. Only add if on special.
   - **Sukin**: Search "Sukin body wash 1L" — add ONLY if the 1L body wash is on special. Do NOT add Sukin shampoo or conditioner even if on special.
   - **Protein (chicken)**: Check price per kg. If chicken breast >$22/kg, message Ellen: "Chicken breast is pricey at $X/kg — I'm getting turkey wings instead 🍗" and sub in turkey wings or lean beef.
   - **Avoid**: products with long additives lists (colours, flavour enhancers, numbers). Prefer whole/natural foods.
   - Add to cart

5. **Checkout → Delivery**
   - Proceed to checkout
   - Confirm delivery address: `22 Franklin St, Leederville WA 6097`
   - Select delivery slots — **Monday preferred**
     - Aim for $2 delivery slots (usually 6am-8am weekday)
     - Accept up to ~$5 if that's the cheapest available
     - **Do NOT choose $15 express delivery** unless it's the only option
     - If no affordable Monday slots → choose Tuesday instead
   - Note the selected slot and price

6. **Complete order**
   - Use saved payment method
   - Confirm order
   - Capture: order number, total, delivery day/time

7. **Confirm back**
   ```bash
   node /Users/clawd/clawd/scripts/grocery-automation.js confirm-order <orderNumber> <total> <deliverySlot>
   ```
   This sends Telegram messages to both Ellen and Petar.

---

## Deadline Check (9pm Sunday)

A second cron fires at 9pm Sunday (`0 21 * * 0`). It runs:
```bash
node /Users/clawd/clawd/scripts/grocery-automation.js deadline-check
```

If state is still `pending` at that point → auto-place the order without waiting for Ellen's approval. It first sends her a heads-up message.

**Cron ID for deadline check:** see SYSTEMS.md section 5b

---

## Updating Ellen's Shopping List After Order

After the order is placed, optionally clear the `## Pending` section of
`/Users/clawd/clawd/ellens_shopping_list.md` (items have now been ordered).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Login fails | Check credentials: `eceklic@gmail.com` / `MOnday22` |
| Item not found | Search more generally (e.g. just brand name) |
| No Monday delivery | Book Tuesday instead |
| Payment declined | Alert Petar via Telegram |
| State file corrupted | Delete `.grocery-state.json` and re-run generate |
| Browser session expired | Log in again manually via browser profile |

---

## Quick Status Check

```bash
node /Users/clawd/clawd/scripts/grocery-automation.js status
```

---

*Last updated: 2026-02-23*
