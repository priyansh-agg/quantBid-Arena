"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DoorTransition from "@/components/DoorTransition";

export default function SelectPage() {
  const [showModal, setShowModal] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [doorOpen, setDoorOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Open doors after a tiny delay for mount safety
    const t = setTimeout(() => setDoorOpen(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleHostAccess = () => {
    setShowModal(true);
  };

  const handleArenaAccess = () => {
    setDoorOpen(false); // Close doors
    setTimeout(() => {
      router.push("/arena");
    }, 800);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim() === "2026") {
      sessionStorage.setItem("auth", "true");
      setDoorOpen(false); // Close doors
      setTimeout(() => {
        router.push("/host");
      }, 800);
    } else {
      setError("INVALID SEAL. ACCESS DENIED.");
    }
  };

  return (
    <div className="select-shell">
      {/* Background container */}
      <div className="select-bg">
        <div className="select-bg-left"></div>
        <div className="select-bg-right"></div>
        <div className="select-katana-slash"></div>
      </div>

      <div className="select-content">
        <header className="select-header">
          <h1 className="select-title">CHOOSE YOUR PATH</h1>
          <p className="select-subtitle">Two Destinies. One Arena.</p>
        </header>

        <div className="select-cards-container">
          {/* Participant Card */}
          <div className="select-path-card path-participant" onClick={handleArenaAccess}>
            <div className="path-icon">⛩️</div>
            <h2 className="path-title">THE PARTICIPANT</h2>
            <p className="path-desc">Step into the arena, prove your worth, and fight for glory.</p>
            <div className="path-action">ENTER ARENA &rarr;</div>
          </div>

          {/* Host Card */}
          <div className="select-path-card path-host" onClick={handleHostAccess}>
            <div className="path-icon">🏯</div>
            <h2 className="path-title">THE SHOGUN</h2>
            <p className="path-desc">Command the fates, orchestrate the battles, and rule the throne.</p>
            <div className="path-action">HOST PANEL &rarr;</div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay samurai-modal">
          <div className="modal-content samurai-modal-content">
            <h2 className="samurai-modal-title">SHOGUN AUTHENTICATION</h2>
            <p className="samurai-modal-desc">Present your royal seal to proceed.</p>
            <form onSubmit={handleSubmit}>
              <input
                type="password"
                placeholder="ENTER SEAL_"
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setError("");
                }}
                autoFocus
                className="modal-input samurai-input"
              />
              {error && (
                <p className="modal-error samurai-error">
                  {error}
                </p>
              )}
              <div className="modal-actions samurai-actions">
                <button
                  type="button"
                  className="btn-samurai-cancel"
                  onClick={() => { setShowModal(false); setKey(""); setError(""); }}
                >
                  ABORT
                </button>
                <button type="submit" className="btn-samurai-submit">
                  AUTHENTICATE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DoorTransition isOpen={doorOpen} />
    </div>
  );
}
