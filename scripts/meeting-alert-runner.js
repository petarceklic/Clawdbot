#!/usr/bin/env node
// meeting-alert-runner.js — called by meeting-alert.sh
// Reads events from EVENTS_FILE, checks for upcoming video calls, iMessages Ellen

const fs = require('fs');
const { execSync } = require('child_process');

const stateFile = process.env.STATE_FILE;
const ellen = process.env.ELLEN;
const eventsFile = process.env.EVENTS_FILE;
const now = parseInt(process.env.NOW);
const windowStart = now + parseInt(process.env.WINDOW_MIN) * 60;
const windowEnd = now + parseInt(process.env.WINDOW_MAX) * 60;

let state = {};
try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}

let data;
try { data = JSON.parse(fs.readFileSync(eventsFile, 'utf8')); } catch(e) {
  console.error('Failed to parse events JSON:', e.message);
  process.exit(0);
}

const events = data.events || data || [];
const videoPattern = /zoom\.us|teams\.microsoft|meet\.google|meet\.jit|webex/i;

for (const e of events) {
  const startStr = e.start && (e.start.dateTime || e.start.date);
  if (!startStr) continue;
  const start = Math.floor(new Date(startStr).getTime() / 1000);
  const id = e.id || (e.summary + startStr);
  const desc = (e.description || '') + (e.location || '') + JSON.stringify(e.conferenceData || {});

  if (!videoPattern.test(desc)) continue;
  if (start < windowStart || start > windowEnd) continue;
  if (state[id]) continue;

  const title = e.summary || 'a meeting';
  const messages = [
    "Hey Elle Bell! Our boy Peki has a meeting in 15, so busy isn't he 🙄 Could you pause any big downloads? We must support his delicate schedule. xo Mia 😊",
    "Hi Ellen, girl to girl, our boy Petar thinks this meeting is very important 😂 Could you turn off downloads for 15 mins so he looks good on camera? xo Mia",
    "Elle Bell! Peki has a very important video call in 15 minutes ⏰ (his words, probably). Could you hit pause on any downloads? Us girls have to keep him looking professional somehow. xo Mia",
    "Hey Ellen 👋 So our boy is jumping into another meeting in 15 min. So in demand 💅 Can you turn off downloads? We're basically his management team at this point. xo Mia",
    "Quick heads up Elle Bell, Peki has a meeting in 15 mins. So important, so busy, so... Peki 😂 Pause downloads if you can! Between us we'll get him through it. xo Mia 🚀",
    "Hi Ellen! Between you and me, our boy Petar is about to try and look very professional on a video call in 15 mins 😄 Could you turn off downloads to help the cause? xo Mia",
    "Elle Bell, girl talk, Peki has a meeting in 15. You handle the wifi, I'll handle the rest 💪 Could you pause downloads? Thanks babe. xo Mia 😘",
  ];
  const msg = messages[Math.floor(Math.random() * messages.length)];

  try {
    const scriptPath = '/tmp/mia-meeting-alert.applescript';
    // Write AppleScript to file to avoid any escaping issues
    const appleScript = `tell application "Messages"
set svc to 1st service whose service type = iMessage
set bud to buddy "${ellen}" of svc
send "${msg.replace(/"/g, '\\"')}" to bud
end tell`;
    fs.writeFileSync(scriptPath, appleScript);
    execSync(`osascript ${scriptPath}`);
    console.log('✓ Messaged Ellen for: ' + title);
    state[id] = Date.now();
  } catch(err) {
    console.error('Failed to send iMessage:', err.message);
  }
}

// Clean up old state entries (older than 24h)
const cutoff = Date.now() - 86400000;
for (const k of Object.keys(state)) {
  if (typeof state[k] === 'number' && state[k] < cutoff) delete state[k];
}

fs.writeFileSync(stateFile, JSON.stringify(state));
