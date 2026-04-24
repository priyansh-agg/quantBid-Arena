"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SelectPage() {
  const [showModal, setShowModal] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleHostAccess = () => {
    setShowModal(true);
  };

  const handleArenaAccess = () => {
    router.push("/arena");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim() === "2026") {
      sessionStorage.setItem("auth", "true");
      router.push("/host");
    } else {
      setError("INVALID KEY. ACCESS DENIED.");
    }
  };

  return (
    <div className="landing-container app-shell">
      <div className="ambient-grid" />
      <div className="math-bg" aria-hidden="true">
        <span>∫ e^x dx = e^x + C</span>
        <span>E = mc²</span>
        <span>∑ (1/n²) = π²/6</span>
        <span>e^(iπ) + 1 = 0</span>
        <span>∇ × B = μ₀J + μ₀ε₀(∂E/∂t)</span>
        <span>f(x) = a₀/2 + ∑(aₙcos(nx) + bₙsin(nx))</span>
      </div>

      <div className="landing-content">
        <div className="landing-card" style={{ background: "var(--bg-base)", border: "1px solid var(--border)", boxShadow: "var(--shadow-glow)" }}>
          <div className="brand-eyebrow" style={{ color: "var(--accent-2)" }}>
            Secure Access Gate
          </div>
          <h1
            className="landing-title"
            style={{
              background: "none",
              WebkitTextFillColor: "var(--text-primary)",
              color: "var(--text-primary)",
              letterSpacing: "0.05em",
            }}
          >
            QuantBid Arena 2026
          </h1>
          <p
            className="landing-subtitle"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "13px",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
            }}
          >
            System ready. Select your interface.
          </p>

          <div className="landing-btn-group">
            {/* Participant view — no auth */}
            <button className="btn-arena" onClick={handleArenaAccess}>
              <span className="btn-icon">◉</span>
              Enter Arena
              <span className="btn-hint">Participant View</span>
            </button>

            {/* Host panel — auth gated */}
            <button className="btn-host" onClick={handleHostAccess}>
              <span className="btn-icon">⌖</span>
              Host Panel
              <span className="btn-hint">Control Room</span>
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>HOST AUTHENTICATION</h2>
            <p>Enter the control room access key to proceed.</p>
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
                style={{
                  fontFamily: "var(--font-mono)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              />
              {error && (
                <p className="modal-error" style={{ color: "var(--accent-2)" }}>
                  {error}
                </p>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => { setShowModal(false); setKey(""); setError(""); }}
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
