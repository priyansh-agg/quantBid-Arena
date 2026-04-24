"use client";

import { useRouter } from "next/navigation";

export default function VideoLandingPage() {
  const router = useRouter();

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
          onClick={() => router.push("/select")}
        >
          ENTER ARENA
        </button>
      </div>
    </div>
  );
}
