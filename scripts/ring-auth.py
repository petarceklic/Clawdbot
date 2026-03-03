#!/usr/bin/env python3
"""First-time Ring authentication — handles 2FA and saves token."""
import json, os, sys
from pathlib import Path
from ring_doorbell import Auth, AuthenticationError, Requires2FAError

TOKEN_FILE = Path.home() / ".ring_token.json"
USER_AGENT = "clawd-ring-monitor/1.0"

def token_updated(token):
    TOKEN_FILE.write_text(json.dumps(token))
    print(f"Token saved to {TOKEN_FILE}")

def do_auth(email, password, otp=None):
    auth = Auth(USER_AGENT, None, token_updated)
    try:
        auth.fetch_token(email, password, otp)
        token_updated(auth.token)
        print("AUTH_SUCCESS")
    except Requires2FAError:
        print("NEEDS_2FA")
        sys.exit(2)

if __name__ == "__main__":
    email = sys.argv[1]
    password = sys.argv[2]
    otp = sys.argv[3] if len(sys.argv) > 3 else None
    do_auth(email, password, otp)
