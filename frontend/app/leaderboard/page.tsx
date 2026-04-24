"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useGameWebSocket } from "@/lib/websocket";
import type { GameState, Team } from "@/types";
import DoorTransition from "@/components/DoorTransition";

const RANK_COLORS = ["#ffc107", "#e0e0e0", "#cd7f32"];

export default function LeaderboardPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [doorOpen, setDoorOpen] = useState(false);
  const router = useRouter();

  // On mount, wait a tiny bit then open the doors
  useEffect(() => {
    const t = setTimeout(() => setDoorOpen(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleState = useCallback((state: GameState) => {
    setTeams(state.teams);
  }, []);

  useGameWebSocket(handleState, () => {});

  const leaderboard = useMemo(
    () => [...teams].sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.name.localeCompare(b.name)
    ),
    [teams]
  );

  const handleReturn = () => {
    setDoorOpen(false); // Close the doors
    setTimeout(() => {
      router.push("/arena");
    }, 800);
  };

  return (
    <div className="leaderboard-shell">
      {/* Background with Kyoto/Samurai aesthetic */}
      <div className="lb-kyoto-bg"></div>
      
      <div className="lb-container">
        <header className="lb-header">
          <h1 className="lb-title">御前試合 <span className="lb-subtitle">STANDINGS</span></h1>
          <button onClick={handleReturn} className="btn-samurai-return">
            ⟵ RETURN TO ARENA
          </button>
        </header>

        <div className="lb-standings-grid">
          {leaderboard.map((team, i) => (
            <div
              key={team.id}
              className={`lb-card ${i === 0 ? "lb-gold" : i === 1 ? "lb-silver" : i === 2 ? "lb-bronze" : ""}`}
              style={{ '--team-color': team.color ?? "var(--text-primary)" } as React.CSSProperties}
            >
              <div className="lb-card-rank" style={{ color: RANK_COLORS[i] ?? "var(--text-muted)" }}>
                #{i + 1}
              </div>
              <div className="lb-card-main">
                <h2 className="lb-team-name">{team.name}</h2>
                <div className="lb-team-meta">
                  <span className="lb-team-qm">
                    {team.balance.toLocaleString()} QM
                  </span>
                </div>
              </div>
              <div className="lb-card-score">
                <span className="lb-score-val">{team.score}</span>
                <span className="lb-score-lbl">RP</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <DoorTransition isOpen={doorOpen} />
    </div>
  );
}
