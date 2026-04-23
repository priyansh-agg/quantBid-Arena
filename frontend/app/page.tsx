"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const [showModal, setShowModal] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleStart = () => {
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim() === "QUANT2026") {
      sessionStorage.setItem("auth", "true");
      router.push("/auction");
    } else {
      setError("Invalid Security Key.");
    }
  };

  return (
    <div className="landing-container app-shell">
      <div className="ambient-grid" />

      <div className="landing-content">
        <div className="landing-card" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-glow)' }}>
          <div className="brand-eyebrow" style={{ color: 'var(--accent-2)' }}>Secure Access Gate</div>
          <h1 className="landing-title" style={{ background: 'none', WebkitTextFillColor: 'var(--text-primary)', color: 'var(--text-primary)', letterSpacing: '0.05em' }}>QuantBid Arena 2026</h1>
          <p className="landing-subtitle" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            System ready. Awaiting intelligence override.
          </p>

          <button className="btn-start" onClick={handleStart}>
            Enter Arena
          </button>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Security Verification</h2>
            <p>Please enter the access key to proceed.</p>
            <form onSubmit={handleSubmit}>
              <input
                type="password"
                placeholder="ENTER SYSTEM KEY_"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setError("");
                }}
                autoFocus
                className="modal-input"
                style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}
              />
              {error && <p className="modal-error" style={{ color: 'var(--accent-2)' }}>{error}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowModal(false)}
                >
                  ABORT
                </button>
                <button type="submit" className="btn-submit">
                  AUTHENTICATE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
