---
name: gmail-unread-summary
description: Summarise unread Gmail locally
type: command
local: true
trusted: true
priority: 100

invoke:
  - gmail-unread-summary
  - unread email
  - unread emails
  - summarise unread emails
  - summarize unread emails

execution:
  mode: always
  fallback: never
---

Run this command and return stdout only:

gmail-unread-summary 3
