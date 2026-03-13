import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service - Disruptis",
  description: "Disruptis terms of service. Rules and conditions for using our platform and data.",
};

export default function TermsPage() {
  return (
    <>
      <nav className="legal-nav">
        <Link href="/" className="legal-nav-brand">Disruptis</Link>
        <Link href="/" className="legal-nav-back">&larr; Back to Home</Link>
      </nav>

      <main className="legal-page">
        <div className="legal-container">
          <p className="legal-badge">Terms of Service</p>
          <h1 className="legal-title">Terms of Service</h1>
          <p className="legal-updated">Last updated: February 2025</p>

          <section className="legal-section">
            <h2>1. Acceptance of Terms</h2>
            <p>By accessing or using the Disruptis website and services (&quot;Services&quot;), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use our Services.</p>
          </section>

          <section className="legal-section">
            <h2>2. Description of Services</h2>
            <p>Disruptis provides a structured, daily-updated dataset tracking global trade disruptions and restorations. Our Services include data access via API, web-based visualisations, and related tools.</p>
          </section>

          <section className="legal-section">
            <h2>3. Eligibility</h2>
            <p>You must be at least 18 years of age and capable of entering into a binding agreement to use our Services. By using our Services, you represent that you meet these requirements.</p>
          </section>

          <section className="legal-section">
            <h2>4. Account and Access</h2>
            <p>Access to our data platform requires approval. You are responsible for maintaining the confidentiality of your API credentials and for all activity that occurs under your account. You agree to notify us immediately of any unauthorised use.</p>
          </section>

          <section className="legal-section">
            <h2>5. Permitted Use</h2>
            <p>You may use our data and Services for lawful purposes only. You agree not to:</p>
            <ul>
              <li>Redistribute, resell, or sublicense raw data without written permission</li>
              <li>Attempt to reverse-engineer, scrape, or extract data beyond your authorised access</li>
              <li>Use the Services to engage in any unlawful activity</li>
              <li>Interfere with or disrupt the integrity or performance of the Services</li>
              <li>Misrepresent your identity or affiliation when requesting access</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>6. Intellectual Property</h2>
            <p>All content, data structures, scoring methodologies, and materials provided through our Services are the intellectual property of Disruptis. You are granted a limited, non-exclusive, non-transferable licence to use the data in accordance with your access agreement.</p>
          </section>

          <section className="legal-section">
            <h2>7. Data Accuracy</h2>
            <p>While we strive to provide accurate and timely data, Disruptis does not guarantee the completeness, accuracy, or reliability of any information provided. Our data is derived from publicly available sources and processed using automated systems including natural language processing.</p>
            <p>Our data should not be used as the sole basis for investment decisions, trading activity, or other financial decisions.</p>
          </section>

          <section className="legal-section">
            <h2>8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, Disruptis shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, or business opportunities, arising from your use of our Services.</p>
          </section>

          <section className="legal-section">
            <h2>9. Termination</h2>
            <p>We reserve the right to suspend or terminate your access to our Services at any time, with or without notice, for any reason, including breach of these Terms.</p>
          </section>

          <section className="legal-section">
            <h2>10. Changes to Terms</h2>
            <p>We may modify these Terms at any time. Continued use of the Services after changes are posted constitutes acceptance of the revised Terms. We encourage you to review these Terms periodically.</p>
          </section>

          <section className="legal-section">
            <h2>11. Governing Law</h2>
            <p>These Terms shall be governed by and construed in accordance with applicable law, without regard to conflict of law principles.</p>
          </section>

          <section className="legal-section">
            <h2>12. Contact</h2>
            <p>If you have questions about these Terms, please reach out via our <Link href="/contact" className="legal-link">contact page</Link>.</p>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
