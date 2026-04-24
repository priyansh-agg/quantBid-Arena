"use client";

import { useEffect, useState } from "react";

export default function DoorTransition({ isOpen }: { isOpen: boolean }) {
  const [render, setRender] = useState(true);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setRender(false), 1000);
      return () => clearTimeout(t);
    } else {
      setRender(true);
    }
  }, [isOpen]);

  if (!render) return null;

  return (
    <div className="door-transition-overlay">
      <div className={`shoji-door left-door ${isOpen ? "open" : ""}`}>
        <div className="shoji-pattern"></div>
      </div>
      <div className={`shoji-door right-door ${isOpen ? "open" : ""}`}>
        <div className="shoji-pattern"></div>
      </div>
    </div>
  );
}
