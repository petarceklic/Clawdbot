import type { Metadata } from "next";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact - Disruptis",
  description: "Get in touch with the Disruptis team.",
};

export default function ContactPage() {
  return (
    <>
      <Nav variant="simple" />

      <main
        className="legal-page"
        style={{ paddingTop: "calc(var(--nav-height) + 40px)" }}
      >
        <div className="legal-container">
          <p className="legal-badge">Contact</p>
          <h1 className="legal-title">Get in Touch</h1>
          <p className="legal-updated">
            Have a question or want to learn more? Send us a message.
          </p>

          <ContactForm />
        </div>
      </main>

      <Footer />
    </>
  );
}
