import type { Metadata } from "next";
import Link from "next/link";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy - Disruptis",
  description: "Disruptis privacy policy. How we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <>
      <nav className="legal-nav">
        <Link href="/" className="legal-nav-brand">Disruptis</Link>
        <Link href="/" className="legal-nav-back">&larr; Back to Home</Link>
      </nav>

      <main className="legal-page">
        <div className="legal-container">
          <p className="legal-badge">Privacy Policy</p>
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-updated">Last updated: February 2025</p>

          <section className="legal-section">
            <h2>1. Introduction</h2>
            <p>Disruptis (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website and use our services.</p>
          </section>

          <section className="legal-section">
            <h2>2. Information We Collect</h2>
            <h3>Information You Provide</h3>
            <p>When you request access to our data platform, we collect:</p>
            <ul>
              <li>Full name</li>
              <li>Work email address</li>
              <li>Company name</li>
              <li>Intended use case</li>
            </ul>

            <h3>Automatically Collected Information</h3>
            <p>When you visit our website, we may automatically collect:</p>
            <ul>
              <li>IP address and approximate location</li>
              <li>Browser type and version</li>
              <li>Pages visited and time spent</li>
              <li>Referring website</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Respond to your enquiries and access requests</li>
              <li>Provide, maintain, and improve our services</li>
              <li>Send relevant updates about our platform</li>
              <li>Analyse website usage and performance</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>4. Data Sharing</h2>
            <p>We do not sell your personal information. We may share your data with:</p>
            <ul>
              <li>Service providers who assist in operating our platform (e.g. hosting, email delivery)</li>
              <li>Professional advisors such as lawyers and accountants where necessary</li>
              <li>Law enforcement or regulatory authorities when required by law</li>
            </ul>
          </section>

          <section className="legal-section">
            <h2>5. Data Retention</h2>
            <p>We retain your personal information for as long as necessary to fulfil the purposes outlined in this policy, unless a longer retention period is required or permitted by law.</p>
          </section>

          <section className="legal-section">
            <h2>6. Data Security</h2>
            <p>We implement appropriate technical and organisational measures to protect your personal information against unauthorised access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure.</p>
          </section>

          <section className="legal-section">
            <h2>7. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to or restrict processing of your data</li>
              <li>Data portability</li>
            </ul>
            <p>To exercise any of these rights, please contact us at the details below.</p>
          </section>

          <section className="legal-section">
            <h2>8. Cookies</h2>
            <p>Our website may use essential cookies to ensure basic functionality. We do not use advertising or tracking cookies. Third-party services embedded on our site (such as map tiles) may set their own cookies.</p>
          </section>

          <section className="legal-section">
            <h2>9. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated revision date. We encourage you to review this policy periodically.</p>
          </section>

          <section className="legal-section">
            <h2>10. Contact</h2>
            <p>If you have questions about this Privacy Policy, please reach out via our <Link href="/contact" className="legal-link">contact page</Link>.</p>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
