"use client";

import { useEffect, useState } from "react";

export default function DoorTransition({ isOpen }: { isOpen: boolean }) {
  // We remove the unmounting logic so the CSS transition always plays.
  // The doors translate 100% off-screen when open, so they won't block clicks.
  
  // However, because React might mount this component with isOpen=false right away on a new page,
  // we actually want it to render closed and then animate to open.
  
  return (
    <div className={`door-transition-overlay ${isOpen ? "is-open" : "is-active"}`}>
      <div className={`shoji-door left-door ${isOpen ? "open" : ""}`}>
        <div className="shoji-pattern"></div>
      </div>
      <div className={`shoji-door right-door ${isOpen ? "open" : ""}`}>
        <div className="shoji-pattern"></div>
      </div>
    </div>
  );
}
