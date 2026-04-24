"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DoorTransition from "@/components/DoorTransition";

export default function VideoLandingPage() {
  const router = useRouter();
  const [doorOpen, setDoorOpen] = useState(true);

  const handleEnter = () => {
    setDoorOpen(false); // Close the doors
    setTimeout(() => {
      router.push("/select");
    }, 800); // Wait for the transition
  };

  return (
    <div className="video-landing-container">
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="landing-video"
      >
        <source src="/landingQuant.mp4" type="video/mp4" />
      </video>

      {/* Overlay Content */}
      <div className="video-landing-overlay">
        <button
          className="btn-enter-arena-premium"
          onClick={handleEnter}
        >
          ENTER ARENA
        </button>
      </div>

      <DoorTransition isOpen={doorOpen} />
    </div>
  );
}
