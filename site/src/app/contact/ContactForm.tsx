"use client";

import { useState, FormEvent } from "react";

export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      subject: (form.elements.namedItem("subject") as HTMLSelectElement).value,
      message: (form.elements.namedItem("message") as HTMLTextAreaElement)
        .value,
    };

    try {
      const res = await fetch("https://formspree.io/f/xpqjqlwe", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        alert("Something went wrong. Please try again.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (submitted) {
    return (
      <div className="contact-success">
        <div className="modal-success-icon">&#10003;</div>
        <h3 className="legal-title" style={{ fontSize: 24 }}>
          Message Sent
        </h3>
        <p className="legal-updated">
          Thanks for reaching out. We&apos;ll get back to you soon.
        </p>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="contactName">Name</label>
        <input
          type="text"
          id="contactName"
          name="name"
          required
          placeholder="Your name"
        />
      </div>
      <div className="form-group">
        <label htmlFor="contactEmail">Email</label>
        <input
          type="email"
          id="contactEmail"
          name="email"
          required
          placeholder="you@company.com"
        />
      </div>
      <div className="form-group">
        <label htmlFor="contactSubject">Subject</label>
        <select id="contactSubject" name="subject" required defaultValue="">
          <option value="" disabled>
            Select a topic
          </option>
          <option value="general">General Enquiry</option>
          <option value="data-access">Data Access</option>
          <option value="technical">Technical Support</option>
          <option value="partnerships">Partnerships</option>
          <option value="press">Media &amp; Press</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="contactMessage">Message</label>
        <textarea
          id="contactMessage"
          name="message"
          required
          placeholder="Tell us what you need..."
          rows={5}
        />
      </div>
      <button
        type="submit"
        className="btn btn-primary btn-lg btn-full"
        disabled={sending}
      >
        {sending ? "Sending..." : "Send Message"}
      </button>
    </form>
  );
}
