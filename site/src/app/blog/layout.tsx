import Link from "next/link";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav variant="simple" />
      <main style={{ minHeight: "60vh", paddingTop: "calc(var(--nav-height) + 40px)" }}>{children}</main>
      {/* Buy Data CTA */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "60px 24px" }}>
        <Link href="/#pricing" style={{ display: "block", textDecoration: "none" }}>
          <div style={{
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            padding: "48px 32px",
            textAlign: "center",
            transition: "border-color 0.2s",
          }}>
            <p style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              Ready to integrate trade intelligence?
            </p>
            <p style={{ marginTop: 8, fontSize: 14, color: "var(--text-secondary)", maxWidth: 440, margin: "8px auto 0", lineHeight: 1.6 }}>
              Access daily-updated disruption data, severity scores, and geographic intelligence for your own analysis.
            </p>
            <span style={{
              marginTop: 24,
              display: "inline-block",
              borderRadius: 8,
              background: "var(--green)",
              padding: "10px 24px",
              fontSize: 14,
              fontWeight: 600,
              color: "#111111",
              transition: "background 0.2s",
            }}>
              Request Access
            </span>
          </div>
        </Link>
      </section>
      <Footer />
    </>
  );
}
