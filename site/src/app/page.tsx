"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Ticker from "@/components/Ticker";
import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import Footer from "@/components/Footer";
import ScrollAnimator from "@/components/ScrollAnimator";
import Modal from "@/components/Modal";
import NetworkCanvas from "@/components/NetworkCanvas";

const MapSection = dynamic(() => import("@/components/MapSection"), { ssr: false });

export default function HomePage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Ticker />
      <Nav variant="full" onOpenModal={() => setModalOpen(true)} />
      <Hero onOpenModal={() => setModalOpen(true)} />
      <MapSection />

      {/* FEATURES SECTION */}
      <section className="features-section" id="features">
        <div className="section-container">
          <span className="section-label anim-fade-up">CAPABILITIES</span>
          <h2 className="section-title anim-fade-up anim-delay-1">Intelligence, not just data</h2>
          <p className="section-subtitle anim-fade-up anim-delay-2">
            Our dataset goes beyond aggregation. Every disruption event is classified, scored, and enriched with structured metadata ready for integration.
          </p>

          <div className="features-grid">
            {/* Continuous Detection */}
            <div className="feature-card anim-fade-up">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              </div>
              <h3 className="feature-title">Continuous Detection</h3>
              <p className="feature-desc">NLP processing of 2,400+ global news sources, wire services, and government feeds. New disruptions captured daily and delivered in structured delta files.</p>
            </div>

            {/* Severity Scoring */}
            <div className="feature-card anim-fade-up anim-delay-1">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
              </div>
              <h3 className="feature-title">Severity Scoring</h3>
              <p className="feature-desc">Proprietary bidirectional -4 to +4 scale capturing both disruptions and restorations with multi-factor weighting.</p>
            </div>

            {/* Geographic Tagging */}
            <div className="feature-card anim-fade-up anim-delay-2">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              </div>
              <h3 className="feature-title">Geographic Tagging</h3>
              <p className="feature-desc">Every event tagged with precise coordinates, affected trade corridors, ports, and border crossings. Map-ready from day one.</p>
            </div>

            {/* Integration Ready */}
            <div className="feature-card anim-fade-up anim-delay-3">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              </div>
              <h3 className="feature-title">Integration Ready</h3>
              <p className="feature-desc">Delivered as versioned Parquet files to your secure cloud bucket. Filter by region, severity, category, and date range. API access available on request.</p>
            </div>

            {/* Predictive Signals */}
            <div className="feature-card anim-fade-up anim-delay-4">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <h3 className="feature-title">Predictive Signals</h3>
              <p className="feature-desc">Early warning indicators based on news velocity, sentiment shift, and historical pattern matching. Know before the disruption escalates.</p>
            </div>

            {/* Structured Categories */}
            <div className="feature-card anim-fade-up anim-delay-5">
              <div className="feature-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
              </div>
              <h3 className="feature-title">Structured Categories</h3>
              <p className="feature-desc">Events classified across 18 disruption types: sanctions, tariffs, port closures, conflicts, climate events, regulatory changes, and more.</p>
            </div>
          </div>
        </div>
      </section>

      {/* DATA PREVIEW SECTION */}
      <section className="data-section" id="data">
        <div className="section-container">
          <span className="section-label anim-fade-up">DATA PREVIEW</span>
          <h2 className="section-title anim-fade-up anim-delay-1">See what you&apos;re licensing</h2>
          <p className="section-subtitle anim-fade-up anim-delay-2">
            Every disruption event is structured, enriched, and delivered as versioned Parquet files. Here&apos;s what the data looks like.
          </p>

          <div className="data-grid">
            {/* JSON Sample */}
            <div className="data-card anim-fade-up anim-delay-3">
              <div className="data-card-header">
                <span className="data-card-title">EXAMPLE RECORD</span>
                <span className="data-card-badge">PARQUET</span>
              </div>
              <div className="data-card-body">
<pre className="code-block"><code>{`{
  `}<span className="code-key">&quot;eventid&quot;</span>{`: `}<span className="code-number">1</span>{`,
  `}<span className="code-key">&quot;date&quot;</span>{`: `}<span className="code-string">&quot;20260101&quot;</span>{`,
  `}<span className="code-key">&quot;final_headline&quot;</span>{`: `}<span className="code-string">&quot;China imposes 55% import
    tariffs on Australian beef,
    impacting trade.&quot;</span>{`,
  `}<span className="code-key">&quot;severity_score&quot;</span>{`: `}<span className="code-number">-2.0</span>{`,
  `}<span className="code-key">&quot;event_sentiment&quot;</span>{`: `}<span className="code-string">&quot;negative&quot;</span>{`,
  `}<span className="code-key">&quot;event_type&quot;</span>{`: `}<span className="code-string">&quot;policy&quot;</span>{`,
  `}<span className="code-key">&quot;country&quot;</span>{`: `}<span className="code-string">&quot;China&quot;</span>{`,
  `}<span className="code-key">&quot;region&quot;</span>{`: `}<span className="code-string">&quot;East Asia&quot;</span>{`,
  `}<span className="code-key">&quot;commodity_tag&quot;</span>{`: `}<span className="code-string">&quot;Livestock &amp; Meat&quot;</span>{`,
  `}<span className="code-key">&quot;trade_routes&quot;</span>{`: `}<span className="code-string">&quot;China-US Pacific route |
    Australia-Asia iron ore/LNG&quot;</span>{`,
  `}<span className="code-key">&quot;temporal_status&quot;</span>{`: `}<span className="code-string">&quot;HAPPENED&quot;</span>{`,
  `}<span className="code-key">&quot;first_seen_at&quot;</span>{`: `}<span className="code-string">&quot;2026-01-01 08:45:00&quot;</span>{`,
  `}<span className="code-key">&quot;days_length&quot;</span>{`: `}<span className="code-number">1</span>{`
}`}</code></pre>
              </div>
            </div>

            {/* Schema Overview */}
            <div className="data-card anim-fade-up anim-delay-4">
              <div className="data-card-header">
                <span className="data-card-title">SCHEMA OVERVIEW</span>
                <span className="data-card-badge">23 FIELDS</span>
              </div>
              <div className="data-card-body">
                <table className="schema-table">
                  <tbody>
                    <tr><td className="schema-field">severity_score</td><td className="schema-desc">-4.0 to +4.0 bidirectional scale</td></tr>
                    <tr><td className="schema-field">event_type</td><td className="schema-desc">strike, supply_cutoff, policy, import, export, infrastructure, natural_event, protest...</td></tr>
                    <tr><td className="schema-field">commodity_tag</td><td className="schema-desc">30+ categories: Crude Oil, Semiconductors, LNG, Maritime &amp; Shipping, Agriculture...</td></tr>
                    <tr><td className="schema-field">trade_routes</td><td className="schema-desc">Affected corridors: Trans-Pacific, Strait of Hormuz, Black Sea...</td></tr>
                    <tr><td className="schema-field">hs_chapter</td><td className="schema-desc">Harmonized System code for commodity classification</td></tr>
                    <tr><td className="schema-field">temporal_status</td><td className="schema-desc">HAPPENED, HAPPENING, PRECURSOR</td></tr>
                    <tr><td className="schema-field">final_headline</td><td className="schema-desc">AI-generated event headline</td></tr>
                    <tr><td className="schema-field">explanation</td><td className="schema-desc">AI-generated impact analysis</td></tr>
                    <tr><td className="schema-field">country / city_town</td><td className="schema-desc">Source country and city-level location</td></tr>
                    <tr><td className="schema-field">region</td><td className="schema-desc">Africa, East Asia, Europe, Middle East, North America...</td></tr>
                    <tr><td className="schema-field">port / waterway</td><td className="schema-desc">Chabahar Port, St Lawrence River...</td></tr>
                    <tr><td className="schema-field">first_seen_at</td><td className="schema-desc">Timestamp of first detection</td></tr>
                    <tr><td className="schema-field">hours_since_first_seen</td><td className="schema-desc">Time elapsed since initial detection</td></tr>
                    <tr><td className="schema-field">first_date / last_date</td><td className="schema-desc">Event date range (YYYYMMDD)</td></tr>
                    <tr><td className="schema-field">days_length</td><td className="schema-desc">Duration of disruption event</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Delivery Structure */}
            <div className="data-card anim-fade-up anim-delay-5" style={{ gridColumn: "1 / -1" }}>
              <div className="data-card-header">
                <span className="data-card-title">DELIVERY STRUCTURE</span>
                <span className="data-card-badge">S3</span>
              </div>
              <div className="data-card-body">
<pre className="code-block"><code><span className="code-key">your-bucket/</span>{`
  `}<span className="code-string">README.md</span>{`
  `}<span className="code-string">data_dictionary.csv</span>{`
  `}<span className="code-string">snapshots/</span>{`            Full dataset (Parquet), versioned weekly
    2026-02-14_v1.parquet
  `}<span className="code-string">daily/</span>{`                Delta files, one per day
    2026-02-14_v1.parquet   `}<span className="code-key">event_id</span>{` + `}<span className="code-key">updated_at_utc</span>{` + `}<span className="code-key">operation</span>{`
  `}<span className="code-string">latest/</span>{`               Pointer files for automation
    snapshot.txt
    daily.txt`}</code></pre>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 14, lineHeight: 1.6 }}>
                  Start from the latest snapshot. Apply daily deltas by <code style={{ fontFamily: "var(--font-mono)", color: "var(--green)", fontSize: 11 }}>event_id</code>. Data dictionary and README included in every delivery.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* USE CASES SECTION */}
      <section className="usecases-section" id="usecases">
        <div className="section-container">
          <span className="section-label anim-fade-up">USE CASES</span>
          <h2 className="section-title anim-fade-up anim-delay-1">Built for decision-makers</h2>
          <p className="section-subtitle anim-fade-up anim-delay-2">
            From trading desks to boardrooms — actionable disruption intelligence for the teams that need it most.
          </p>

          <div className="usecases-grid">
            {/* Commodity Trading */}
            <div className="usecase-card anim-fade-up">
              <div className="usecase-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              </div>
              <h3 className="usecase-title">Commodity Trading</h3>
              <p className="usecase-desc">Signal detection for trading desks. Identify supply shocks, export bans, and route disruptions before they hit the market.</p>
            </div>

            {/* Supply Chain Risk */}
            <div className="usecase-card anim-fade-up anim-delay-1">
              <div className="usecase-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <h3 className="usecase-title">Supply Chain Risk</h3>
              <p className="usecase-desc">Early warning for procurement teams. Monitor supplier regions, track port closures, and assess cascading disruption risk.</p>
            </div>

            {/* Insurance & Underwriting */}
            <div className="usecase-card anim-fade-up anim-delay-2">
              <div className="usecase-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" /><path d="M12 4v16" /></svg>
              </div>
              <h3 className="usecase-title">Insurance &amp; Underwriting</h3>
              <p className="usecase-desc">Exposure assessment for cargo and trade credit underwriters. Quantify risk by route, region, and commodity with daily-updated datasets.</p>
            </div>

            {/* Policy & Research */}
            <div className="usecase-card anim-fade-up anim-delay-3">
              <div className="usecase-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
              </div>
              <h3 className="usecase-title">Policy &amp; Research</h3>
              <p className="usecase-desc">Structured datasets for analysts and academics. Study trade policy impacts, sanction effects, and geopolitical disruption patterns.</p>
            </div>

            {/* Logistics Planning */}
            <div className="usecase-card anim-fade-up anim-delay-4">
              <div className="usecase-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
              </div>
              <h3 className="usecase-title">Logistics Planning</h3>
              <p className="usecase-desc">Route disruption alerts for freight operators. Reroute shipments proactively with daily corridor status and severity data.</p>
            </div>

            {/* Market Intelligence */}
            <div className="usecase-card anim-fade-up anim-delay-5">
              <div className="usecase-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
              </div>
              <h3 className="usecase-title">Market Intelligence</h3>
              <p className="usecase-desc">Macro trend detection for strategy teams. Track disruption patterns across sectors and regions to inform investment and positioning.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="cta-section" id="pricing">
        <NetworkCanvas count={240} maxDist={160} speed={0.2} className="footer-network" />
        <div className="section-container">
          <div className="cta-card">
            <div className="cta-glow"></div>
            <h2 className="cta-title">Ready to integrate trade intelligence?</h2>
            <p className="cta-subtitle">Trade disruption intelligence your team can act on.</p>
            <div className="cta-buttons">
              <button className="btn btn-primary btn-lg" onClick={() => setModalOpen(true)}>Request Data Access</button>
              <a href="#platform" className="btn btn-ghost btn-lg">Explore the Data</a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      <ScrollAnimator />
    </>
  );
}
