#!/bin/bash
# Check if Paak by Petar Ceklic is live on the App Store

RESULT=$(curl -s "https://itunes.apple.com/search?term=Paak&entity=software&country=au&limit=10")

# Check if any result matches "Paak" by Petar Ceklic
MATCH=$(echo "$RESULT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
results = data.get('results', [])
for app in results:
    name = app.get('trackName', '').lower()
    dev = app.get('artistName', '').lower()
    if 'paak' in name and ('petar' in dev or 'ceklic' in dev):
        print('FOUND')
        print('Name:', app.get('trackName'))
        print('Developer:', app.get('artistName'))
        print('URL:', app.get('trackViewUrl'))
        print('Price:', app.get('formattedPrice', 'Unknown'))
        sys.exit(0)
print('NOT_FOUND')
" 2>/dev/null)

echo "$MATCH"
