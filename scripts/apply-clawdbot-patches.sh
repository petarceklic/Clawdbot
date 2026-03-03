#!/bin/bash
# apply-clawdbot-patches.sh
# Re-applies node_modules patches required for claude-sonnet-4-6 support.
# Run this after any clawdbot npm update.
# Safe to run multiple times — checks before patching (idempotent).

set -e

CLAWDBOT_ROOT="/opt/homebrew/lib/node_modules/clawdbot"
MODELS_FILE="$CLAWDBOT_ROOT/node_modules/@mariozechner/pi-ai/dist/models.generated.js"
FILTER_FILE="$CLAWDBOT_ROOT/dist/agents/live-model-filter.js"
AUTH_FILE="$CLAWDBOT_ROOT/dist/commands/configure.gateway-auth.js"

PATCHED=0
ERRORS=0

echo "=== Clawdbot patch script ==="
echo "Checking patches for claude-sonnet-4-6 support..."
echo ""

# ─── Patch 1: models.generated.js ────────────────────────────────────────────
echo "1. Checking models.generated.js..."
if grep -q '"claude-sonnet-4-6"' "$MODELS_FILE" 2>/dev/null; then
  echo "   ✓ Already patched"
else
  echo "   ✗ Patch missing — applying..."
  # Insert the claude-sonnet-4-6 model block before the "cerebras" section
  PATCH_BLOCK='        "claude-sonnet-4-6": {\n            id: "claude-sonnet-4-6",\n            name: "Claude Sonnet 4.6 (latest)",\n            api: "anthropic-messages",\n            provider: "anthropic",\n            baseUrl: "https://api.anthropic.com",\n            reasoning: true,\n            input: ["text", "image"],\n            cost: {\n                input: 3,\n                output: 15,\n                cacheRead: 0.3,\n                cacheWrite: 3.75,\n            },\n            contextWindow: 200000,\n            maxTokens: 64000,\n        },'
  if sed -i '' "s/    \"cerebras\": {/$PATCH_BLOCK\n    \"cerebras\": {/" "$MODELS_FILE" 2>/dev/null; then
    echo "   ✓ Patch applied"
    PATCHED=$((PATCHED + 1))
  else
    echo "   ✗ ERROR: Failed to patch models.generated.js"
    ERRORS=$((ERRORS + 1))
  fi
fi

# ─── Patch 2: live-model-filter.js ───────────────────────────────────────────
echo "2. Checking live-model-filter.js (ANTHROPIC_PREFIXES)..."
if grep -q '"claude-sonnet-4-6"' "$FILTER_FILE" 2>/dev/null; then
  echo "   ✓ Already patched"
else
  echo "   ✗ Patch missing — applying (additive insert)..."
  # Additive: insert claude-sonnet-4-6 after claude-opus-4-5, preserving any other entries
  if sed -i '' 's/"claude-opus-4-5"/"claude-opus-4-5", "claude-sonnet-4-6"/' "$FILTER_FILE" 2>/dev/null; then
    echo "   ✓ Patch applied"
    PATCHED=$((PATCHED + 1))
  else
    echo "   ✗ ERROR: Failed to patch live-model-filter.js"
    ERRORS=$((ERRORS + 1))
  fi
fi

# ─── Patch 3: configure.gateway-auth.js ──────────────────────────────────────
echo "3. Checking configure.gateway-auth.js (OAuth allowlist)..."
if grep -q '"anthropic/claude-sonnet-4-6"' "$AUTH_FILE" 2>/dev/null; then
  echo "   ✓ Already patched"
else
  echo "   ✗ Patch missing — applying..."
  # Insert claude-sonnet-4-6 after the claude-opus-4-5 entry in the allowlist
  if sed -i '' 's/"anthropic\/claude-opus-4-5",/"anthropic\/claude-opus-4-5",\n    "anthropic\/claude-sonnet-4-6",/' "$AUTH_FILE" 2>/dev/null; then
    echo "   ✓ Patch applied"
    PATCHED=$((PATCHED + 1))
  else
    echo "   ✗ ERROR: Failed to patch configure.gateway-auth.js"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""
echo "=== Done ==="
if [ $ERRORS -gt 0 ]; then
  echo "⚠️  $ERRORS patch(es) FAILED. Manual intervention required."
  exit 1
elif [ $PATCHED -gt 0 ]; then
  echo "✅ $PATCHED patch(es) applied. Restart Clawdbot to load changes:"
  echo "   clawdbot gateway restart"
else
  echo "✅ All patches already in place. No action needed."
fi
