import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Methodology - Disruptis",
  description: "How Disruptis collects, classifies, and scores global trade disruption data.",
};

export default function MethodologyPage() {
  return (
    <>
      <Nav variant="simple" />

      <main className="legal-page" style={{ paddingTop: "calc(var(--nav-height) + 40px)" }}>
        <div className="legal-container methodology-container">
          <p className="legal-badge">Methodology</p>
          <h1 className="legal-title">How the Data is Created</h1>
          <p className="legal-updated">Our pipeline from raw sources to structured trade intelligence.</p>

          {/* Pipeline overview */}
          <div className="method-pipeline">
            <div className="method-step">
              <div className="method-step-num">01</div>
              <h3>Source Collection</h3>
              <p>We continuously ingest content from thousands of global sources — news wires, government trade bulletins, port authority notices, commodity exchanges, and regulatory filings across 40+ countries.</p>
            </div>
            <div className="method-step">
              <div className="method-step-num">02</div>
              <h3>Event Detection</h3>
              <p>Natural language processing models scan incoming content to identify trade-relevant events — disruptions, policy changes, infrastructure developments, supply shifts, and market restorations.</p>
            </div>
            <div className="method-step">
              <div className="method-step-num">03</div>
              <h3>Classification</h3>
              <p>Each detected event is automatically classified across multiple dimensions: event type, affected commodities, geographic region, impacted trade routes, and temporal status.</p>
            </div>
            <div className="method-step">
              <div className="method-step-num">04</div>
              <h3>Severity Scoring</h3>
              <p>Events are assigned a severity score on a bidirectional scale from -4.0 (major disruption) to +4.0 (significant restoration), reflecting both the magnitude and direction of trade impact.</p>
            </div>
            <div className="method-step">
              <div className="method-step-num">05</div>
              <h3>Enrichment</h3>
              <p>Structured records are enriched with trade route mapping, HS commodity codes, geographic coordinates, and cross-references to related events for full contextual depth.</p>
            </div>
            <div className="method-step">
              <div className="method-step-num">06</div>
              <h3>Delivery</h3>
              <p>Final records are delivered daily as versioned Parquet files to your secure cloud bucket, ready for integration into trading systems, risk dashboards, research platforms, and supply chain tools. API access is available on request.</p>
            </div>
          </div>

          {/* Severity scale */}
          <section className="legal-section">
            <h2>Severity Scale</h2>
            <p>Our bidirectional severity score captures both disruptions and restorations on a single continuous scale.</p>

            <div className="severity-scale">
              <div className="severity-row severity-neg">
                <span className="severity-label">-4.0</span>
                <span className="severity-desc">Critical disruption — major supply chain breakdown, port closure, or trade embargo</span>
              </div>
              <div className="severity-row severity-neg">
                <span className="severity-label">-3.0</span>
                <span className="severity-desc">Severe disruption — significant operational impact, potential cascading effects</span>
              </div>
              <div className="severity-row severity-neg">
                <span className="severity-label">-2.0</span>
                <span className="severity-desc">Moderate disruption — localised impact, partial service reduction</span>
              </div>
              <div className="severity-row severity-neg">
                <span className="severity-label">-1.0</span>
                <span className="severity-desc">Minor disruption — limited scope, manageable delays or restrictions</span>
              </div>
              <div className="severity-row severity-pos">
                <span className="severity-label">+1.0</span>
                <span className="severity-desc">Minor positive — incremental improvement, new trade agreement, or capacity expansion</span>
              </div>
              <div className="severity-row severity-pos">
                <span className="severity-label">+2.0</span>
                <span className="severity-desc">Moderate positive — resumed operations, lifted restrictions, or recovered routes</span>
              </div>
              <div className="severity-row severity-pos">
                <span className="severity-label">+3.0</span>
                <span className="severity-desc">Strong positive — major trade corridor reopening or significant policy breakthrough</span>
              </div>
              <div className="severity-row severity-pos">
                <span className="severity-label">+4.0</span>
                <span className="severity-desc">Critical restoration — full normalisation of major disrupted trade flow</span>
              </div>
            </div>
          </section>

          {/* Event types */}
          <section className="legal-section">
            <h2>Event Classification</h2>
            <p>Every event is tagged with a primary type reflecting the nature of the disruption or development.</p>

            <div className="method-tags">
              <span className="method-tag">Strike</span>
              <span className="method-tag">Supply Cutoff</span>
              <span className="method-tag">Policy</span>
              <span className="method-tag">Import</span>
              <span className="method-tag">Export</span>
              <span className="method-tag">Infrastructure</span>
              <span className="method-tag">Production</span>
            </div>
          </section>

          {/* Commodity coverage */}
          <section className="legal-section">
            <h2>Commodity Coverage</h2>
            <p>We track disruptions across 18 major commodity categories spanning energy, agriculture, metals, manufacturing, and logistics.</p>

            <div className="method-tags">
              <span className="method-tag">Crude Oil</span>
              <span className="method-tag">Natural Gas</span>
              <span className="method-tag">Semiconductors</span>
              <span className="method-tag">Steel</span>
              <span className="method-tag">Iron Ore</span>
              <span className="method-tag">Rice</span>
              <span className="method-tag">Sugar</span>
              <span className="method-tag">Livestock &amp; Meat</span>
              <span className="method-tag">Shipping &amp; Logistics</span>
              <span className="method-tag">Electricity</span>
              <span className="method-tag">Agricultural Products</span>
              <span className="method-tag">Finance &amp; Trade Policy</span>
            </div>
          </section>

          {/* Data quality */}
          <section className="legal-section">
            <h2>Data Quality</h2>
            <p>We maintain data integrity through multiple layers:</p>
            <ul>
              <li>Duplicate detection and event deduplication across sources</li>
              <li>Confidence scoring on NLP classifications</li>
              <li>Temporal tracking — events are tagged as upcoming, happening, or resolved</li>
              <li>Daily dataset refresh with full historical backfill</li>
              <li>Human-in-the-loop review for edge cases and high-severity events</li>
            </ul>
          </section>

          {/* Output format */}
          <section className="legal-section">
            <h2>Output Format</h2>
            <p>Each record contains 23 structured fields including severity score, event type, commodity tag, trade routes, geographic coordinates, HS chapter codes, and temporal metadata. Data is delivered as Apache Parquet files with daily deltas and weekly full snapshots. See the <Link href="/#data" className="legal-link">data section</Link> on our homepage for a sample record and delivery structure.</p>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
