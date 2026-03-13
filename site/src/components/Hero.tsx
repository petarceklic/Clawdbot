'use client';

import { useEffect, useState, useRef } from 'react';
import NetworkCanvas from './NetworkCanvas';

interface HeroProps {
  onOpenModal: () => void;
}

interface SiteData {
  stats: {
    disruptions: number;
    sources: number;
  };
  riskIndex: {
    score: number;
    label: string;
    sparkline: number[];
    change: number;
    trend: string;
  };
}

export default function Hero({ onOpenModal }: HeroProps) {
  const [data, setData] = useState<SiteData | null>(null);
  const [sourceCount, setSourceCount] = useState(2412);
  const sourceCountRef = useRef(2412);
  const tickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch data
  useEffect(() => {
    fetch('/data.json')
      .then((res) => res.json())
      .then((d: SiteData) => {
        setData(d);
        sourceCountRef.current = d.stats.sources;
        setSourceCount(d.stats.sources);
      })
      .catch(() => {});
  }, []);

  // Source counter ticker
  useEffect(() => {
    function tick() {
      sourceCountRef.current += Math.floor(Math.random() * 3) + 1;
      setSourceCount(sourceCountRef.current);
      const delay = 800 + Math.random() * 2200;
      tickTimeoutRef.current = setTimeout(tick, delay);
    }
    const initial = setTimeout(tick, 2000);
    return () => {
      clearTimeout(initial);
      if (tickTimeoutRef.current) clearTimeout(tickTimeoutRef.current);
    };
  }, []);

  const disruptionCount = data ? data.stats.disruptions.toLocaleString() : '\u2014';

  return (
    <section className="hero" id="hero">
      <NetworkCanvas count={90} maxDist={150} speed={0.25} className="hero-network" />
      <div className="hero-inner">
        <div className="hero-badge anim-fade-up">
          <span className="pulse-dot" style={{ animation: 'none' }}></span>
          <span>
            DAILY UPDATES FROM{' '}
            <span id="sourceCount">{sourceCount.toLocaleString()}</span>+ SOURCES
          </span>
        </div>

        <h1 className="hero-title anim-fade-up anim-delay-1">
          <span className="hero-title-line1">Global Trade</span>
          <span className="hero-title-line2">Disruption Intelligence</span>
        </h1>

        <p className="hero-subtitle anim-fade-up anim-delay-2">
          Trade disruption intelligence, updated daily. Scored, classified, and
          delivered as structured datasets.
        </p>

        <div className="hero-ctas anim-fade-up anim-delay-3">
          <button className="btn btn-primary btn-lg" onClick={onOpenModal}>
            Request Data Access
          </button>
          <a href="#platform" className="btn btn-ghost btn-lg">
            Explore the Data
          </a>
        </div>

        <div className="hero-stats anim-fade-up anim-delay-4">
          <div className="hero-stat">
            <span
              className="hero-stat-value"
              style={{ color: 'var(--green)' }}
              id="disruptionCount"
            >
              {disruptionCount}
            </span>
            <span className="hero-stat-label">Active Disruptions</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value" style={{ color: 'var(--green)' }}>
              2.4k
            </span>
            <span className="hero-stat-label">Sources Monitored</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value" style={{ color: 'var(--green)' }}>
              24hr
            </span>
            <span className="hero-stat-label">Update Cycle</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value" style={{ color: 'var(--green)' }}>
              99.7%
            </span>
            <span className="hero-stat-label">Uptime SLA</span>
          </div>
        </div>
      </div>
    </section>
  );
}
