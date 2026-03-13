'use client';

import { useEffect, useState } from 'react';

interface TickerItem {
  dot: string;
  text: string;
  tag: string;
}

export default function Ticker() {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    fetch('/data.json')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.ticker) {
          setItems(data.ticker);
        }
      })
      .catch(() => {});
  }, []);

  if (items.length === 0) {
    return (
      <div className="ticker" id="ticker">
        <div className="ticker-track">
          <div className="ticker-content" id="tickerContent"></div>
          <div className="ticker-content" id="tickerContentDupe" aria-hidden="true"></div>
        </div>
      </div>
    );
  }

  const tickerContent = items.map((item, i) => (
    <span className="ticker-item" key={i}>
      <span className={`ticker-dot ticker-dot-${item.dot}`}></span>
      <span>{item.text}</span>
      <span className="ticker-tag">{item.tag}</span>
    </span>
  ));

  return (
    <div className="ticker" id="ticker">
      <div className="ticker-track">
        <div className="ticker-content" id="tickerContent">
          {tickerContent}
        </div>
        <div className="ticker-content" id="tickerContentDupe" aria-hidden="true">
          {tickerContent}
        </div>
      </div>
    </div>
  );
}
