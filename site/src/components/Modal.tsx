'use client';

import { useState, useEffect, useCallback } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Modal({ isOpen, onClose }: ModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleEscape);
    } else {
      document.body.style.overflow = '';
      setSubmitted(false);
      setSubmitting(false);
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleEscape]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      await fetch('https://formspree.io/f/xpqjqlwe', {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json',
        },
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`modal-overlay${isOpen ? ' open' : ''}`}
      id="modalOverlay"
      onClick={handleOverlayClick}
    >
      <div className="modal">
        <button className="modal-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
        <h3 className="modal-title">Request Data Access</h3>
        <p className="modal-subtitle">Tell us a bit about your needs and we&#39;ll be in touch.</p>
        <form
          className="modal-form"
          id="requestForm"
          onSubmit={handleSubmit}
          style={{ display: submitted ? 'none' : undefined }}
        >
          <div className="form-group">
            <label htmlFor="formName">Full Name</label>
            <input
              type="text"
              id="formName"
              name="name"
              required
              placeholder="Jane Smith"
            />
          </div>
          <div className="form-group">
            <label htmlFor="formEmail">Work Email</label>
            <input
              type="email"
              id="formEmail"
              name="email"
              required
              placeholder="jane@company.com"
            />
          </div>
          <div className="form-group">
            <label htmlFor="formCompany">Company</label>
            <input
              type="text"
              id="formCompany"
              name="company"
              required
              placeholder="Acme Corp"
            />
          </div>
          <div className="form-group">
            <label htmlFor="formUseCase">Use Case</label>
            <select id="formUseCase" name="use_case" required defaultValue="">
              <option value="" disabled>
                Select a use case
              </option>
              <option value="risk-monitoring">Supply Chain Risk Monitoring</option>
              <option value="trading">Commodity Trading Signals</option>
              <option value="research">Academic / Policy Research</option>
              <option value="insurance">Insurance / Underwriting</option>
              <option value="logistics">Logistics Planning</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg btn-full"
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </form>
        <div className="modal-success" style={{ display: submitted ? undefined : 'none' }}>
          <div className="modal-success-icon">&#10003;</div>
          <h3 className="modal-title">Request Received</h3>
          <p className="modal-subtitle">Thanks for your interest. We&#39;ll be in touch soon.</p>
        </div>
      </div>
    </div>
  );
}
