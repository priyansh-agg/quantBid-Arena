"use client";

export default function ParticlesBackdrop() {
  // Pure CSS ambient backdrop — no external deps, no SSR issues
  return (
    <div className="particles-layer" aria-hidden="true">
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
    </div>
  );
}
