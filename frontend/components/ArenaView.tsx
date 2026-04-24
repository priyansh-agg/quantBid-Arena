"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameWebSocket, type PhaseState } from "@/lib/websocket";
import type { Bid, GameState, PowerCard, Question, QuestionStatus, Team } from "@/types";
import 'katex/dist/katex.min.css';
import renderMathInElement from 'katex/contrib/auto-render';
import DoorTransition from "./DoorTransition";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatTime(s: number): string {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 60).toString().padStart(2, "0")}:${(v % 60).toString().padStart(2, "0")}`;
}

function statusLabel(s: QuestionStatus, reCount: number): string {
  const labels: Record<QuestionStatus, string> = {
    AVAILABLE: "Available",
    BIDDING: "Bidding Open",
    SOLD: "Sold",
    SOLVING: "Solving",
    SOLVED: "Solved",
    FAILED: "Failed",
    RE_AUCTION_PENDING: "Re-Auction",
    CLOSED: "Closed",
  };
  const base = labels[s] ?? s;
  return reCount > 0 && s === "BIDDING" ? `Re-Auction: ${base}` : base;
}

function statusClass(s: QuestionStatus): string {
  const map: Record<QuestionStatus, string> = {
    AVAILABLE: "status-available",
    BIDDING: "status-bidding",
    SOLD: "status-sold",
    SOLVING: "status-solving",
    SOLVED: "status-solved",
    FAILED: "status-failed",
    RE_AUCTION_PENDING: "status-reauction",
    CLOSED: "status-closed",
  };
  return map[s] ?? "";
}

function computeRemainingSeconds(question: Question): number {
  if (question.status !== "SOLVING") {
    return question.active_time_seconds ?? question.time_limit_seconds;
  }
  if (!question.solve_started_at || !question.active_time_seconds) {
    return question.active_time_seconds ?? question.time_limit_seconds;
  }
  const started = new Date(question.solve_started_at).getTime();
  const elapsed = Math.floor((Date.now() - started) / 1000);
  return Math.max(0, question.active_time_seconds - elapsed);
}

const RANK_COLORS = ["#C9A857", "#8A93A6", "#CD7F32"]; // Gold, Silver, Bronze

// ─────────────────────────────────────────────────────────────
// ArenaView — Read-only participant display
// Phase is fully server-driven (host controlled)
// ─────────────────────────────────────────────────────────────

export default function ArenaView() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [powerCards, setPowerCards] = useState<PowerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // ── Phase state (server-driven) ──────────────────────────
  const [phase, setPhase] = useState<"QUESTION" | "TRANSITION" | "WINNER" | "WRONG">("QUESTION");
  const [memeText, setMemeText] = useState("INITIALIZING ARENA");
  const [currentQuestionId, setCurrentQuestionId] = useState<number | null>(null);
  const [winnerInfo, setWinnerInfo] = useState<{ team_name?: string; team_color?: string; question_id?: number }>({});
  const [doorOpen, setDoorOpen] = useState(true);
  const router = useRouter();

  // Single source of truth: use server-pinned question id.
  // Fallback to status-scanning only when host hasn't pinned one yet.
  const activeQuestion = useMemo(() => {
    if (currentQuestionId !== null) {
      return questions.find((q) => q.id === currentQuestionId) ?? null;
    }
    // Fallback: pick first question with active status
    return (
      questions.find((q) => ["BIDDING", "SOLVING", "FAILED"].includes(q.status)) ??
      questions[0] ??
      null
    );
  }, [questions, currentQuestionId]);

  const leaderboard = useMemo(
    () => [...teams].sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.name.localeCompare(b.name)
    ),
    [teams]
  );

  const currentBids = useMemo(
    () => bids
      .filter((b) => b.question_id === activeQuestion?.id)
      .sort((a, b) => b.amount - a.amount),
    [bids, activeQuestion]
  );

  // ── WebSocket callbacks ──────────────────────────────────

  const handleState = useCallback((state: GameState) => {
    setQuestions(state.questions);
    setTeams(state.teams);
    setBids(state.bids);
    setPowerCards(state.power_cards);
    setLoading(false);
  }, []);

  const handlePhase = useCallback((ps: PhaseState) => {
    setPhase(ps.phase);
    setMemeText(ps.meme_text);
    setCurrentQuestionId(ps.current_question_id);
    setWinnerInfo(ps.winner_info ?? {});
  }, []);

  useGameWebSocket(handleState, handlePhase);

  // ── Live timer ───────────────────────────────────────────

  useEffect(() => {
    if (!activeQuestion) return;
    setTimerSeconds(computeRemainingSeconds(activeQuestion));
    if (activeQuestion.status !== "SOLVING") return;
    const id = setInterval(() => {
      setTimerSeconds(computeRemainingSeconds(activeQuestion));
    }, 500);
    return () => clearInterval(id);
  }, [activeQuestion]);

  const assignedTeam = activeQuestion
    ? teams.find((t) => t.id === activeQuestion.assigned_team_id)
    : null;

  const handleLeaderboardClick = () => {
    setDoorOpen(false);
    setTimeout(() => {
      router.push("/leaderboard");
    }, 800);
  };

  // Auto-render KaTeX when the active question changes
  useEffect(() => {
    const el = document.getElementById("arena-question-container");
    if (el) {
      renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false }
        ],
        throwOnError: false
      });
    }
  }, [activeQuestion?.question_text, activeQuestion?.options, phase]);

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="arena-shell">
        <div className="lb-kyoto-bg"></div>
        <div className="arena-loading">
          <div className="spinner" />
          <p className="meme-text">CONNECTING TO ARENA_</p>
        </div>
      </div>
    );
  }

  // WINNER phase — correct answer celebration
  if (phase === "WINNER") {
    const tColor = winnerInfo.team_color ?? "#C9A857";
    return (
      <div className="arena-shell arena-shell--winner">
        <div className="lb-kyoto-bg"></div>

        <div className="arena-winner-screen">
          {/* Celebration rings */}
          <div className="winner-rings" aria-hidden="true">
            <div className="winner-ring winner-ring-1" style={{ borderColor: tColor }} />
            <div className="winner-ring winner-ring-2" style={{ borderColor: tColor }} />
            <div className="winner-ring winner-ring-3" style={{ borderColor: tColor }} />
          </div>

          <div className="winner-content">
            <p className="winner-eyebrow">CORRECT ANSWER</p>
            <div className="winner-trophy" aria-hidden="true">🏆</div>
            <p
              className="winner-team-name"
              style={{ color: tColor, textShadow: `0 0 40px ${tColor}80` }}
            >
              {winnerInfo.team_name ?? "WINNER"}
            </p>
            <p className="winner-sub">QUESTION SOLVED</p>
          </div>


        </div>

        <footer className="arena-footer">
          <span className="arena-brand">QUANTBID ARENA 2026</span>
          <span className="arena-footer-dot" />
          <span className="arena-footer-sub">WINNER</span>
        </footer>
      </div>
    );
  }

  // WRONG phase — incorrect answer display
  if (phase === "WRONG") {
    const tColor = winnerInfo.team_color ?? "#E05555";
    return (
      <div className="arena-shell arena-shell--wrong">
        <div className="lb-kyoto-bg"></div>

        <div className="arena-winner-screen">
          {/* Red pulsing rings */}
          <div className="winner-rings" aria-hidden="true">
            <div className="winner-ring winner-ring-1" style={{ borderColor: tColor }} />
            <div className="winner-ring winner-ring-2" style={{ borderColor: tColor }} />
            <div className="winner-ring winner-ring-3" style={{ borderColor: tColor }} />
          </div>

          <div className="winner-content">
            <p className="winner-eyebrow wrong-eyebrow">INCORRECT ANSWER</p>
            <div className="winner-trophy wrong-icon" aria-hidden="true">✗</div>
            <p
              className="winner-team-name"
              style={{ color: tColor, textShadow: `0 0 40px ${tColor}60` }}
            >
              {winnerInfo.team_name ?? "TEAM"}
            </p>
            <p className="winner-sub">QUESTION FAILED</p>
          </div>


        </div>

        <footer className="arena-footer">
          <span className="arena-brand">QUANTBID ARENA 2026</span>
          <span className="arena-footer-dot" />
          <span className="arena-footer-sub">FAILED</span>
        </footer>
      </div>
    );
  }

  // TRANSITION phase — host-controlled meme screen
  if (phase === "TRANSITION") {
    return (
      <div className="arena-shell arena-shell--transition">
        <div className="lb-kyoto-bg"></div>

        <div className="arena-meme-screen">
          {/* Animated concentric rings */}
          <div className="meme-rings" aria-hidden="true">
            <div className="meme-ring meme-ring-1" />
            <div className="meme-ring meme-ring-2" />
            <div className="meme-ring meme-ring-3" />
          </div>

          <div className="meme-content">
            <p className="meme-label">PROCESSING</p>
            <p className="meme-main">{memeText}<span className="meme-cursor">_</span></p>
            <p className="meme-sublabel">Host is preparing the next question</p>
          </div>

        </div>

        <footer className="arena-footer">
          <span className="arena-brand">QUANTBID ARENA 2026</span>
          <span className="arena-footer-dot" />
          <span className="arena-footer-sub">STANDBY</span>
        </footer>
      </div>
    );
  }

  // QUESTION phase — show the current question
  return (
    <div className="arena-shell">
      <div className="lb-kyoto-bg"></div>

      <div className="arena-grid">        {/* ── CENTER: Question Spotlight ── */}
        <main className="arena-center">
          {activeQuestion ? (
            <>
              <div className="arena-status-row">
                <span className={`status-badge ${statusClass(activeQuestion.status)}`}>
                  {statusLabel(activeQuestion.status, activeQuestion.re_auction_count)}
                </span>
                <span className="arena-q-id">Q{activeQuestion.id}</span>
              </div>

              <div className="arena-question-block" id="arena-question-container">
                <div className="arena-meta-row" style={{ marginBottom: "24px", justifyContent: "flex-start", gap: "16px", paddingBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span className="arena-chip arena-chip-rp">{activeQuestion.reward_points} RP</span>
                  <span className="arena-chip arena-chip-qm">Base {activeQuestion.base_amount} QM</span>
                </div>
                <h1 className="arena-question-text">
                  {activeQuestion.question_text}
                </h1>

                {activeQuestion.options && activeQuestion.options.length > 0 && (
                  <ol className="arena-option-list">
                    {activeQuestion.options.map((opt, i) => (
                      <li key={i} className="arena-option-item">
                        <span className="arena-option-letter">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span>{opt}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>



            </>
          ) : (
            <div className="arena-idle">
              <p className="arena-idle-text">ARENA READY</p>
              <p className="arena-idle-sub">Waiting for host to begin the session.</p>
            </div>
          )}
        </main>

        {/* ── RIGHT: Timer + Current Bids ── */}
        <aside className="arena-right">
          {activeQuestion?.status === "SOLVING" && assignedTeam && (
            <div className="arena-solving-spotlight" style={{ '--team-color': assignedTeam.color ?? "var(--accent)", transform: 'scale(1.02)' } as React.CSSProperties}>
              <p className="arena-panel-label" style={{ color: "var(--team-color)", textShadow: "0 0 10px var(--team-color)" }}>CURRENTLY SOLVING</p>
              <div className="arena-solving-team-card">
                <h2 className="solving-team-name">{assignedTeam.name}</h2>
                <div className="solving-team-bid">
                  Bid: <strong>{activeQuestion.current_bid_amount?.toLocaleString()} QM</strong>
                </div>
              </div>
            </div>
          )}

          <button onClick={handleLeaderboardClick} className="btn-samurai-link">
            ⛩️ VIEW STANDINGS
          </button>

          {activeQuestion && ["BIDDING", "SOLVING"].includes(activeQuestion.status) && (
            <div className="arena-timer-block">
              <p className="arena-timer-label">
                {activeQuestion.status === "SOLVING" ? "SOLVE TIME" : "BID TIME"}
              </p>
              <p className={`arena-timer-value ${
                timerSeconds <= 10 && activeQuestion.status === "SOLVING"
                  ? "timer-critical" : ""
              }`}>
                {formatTime(timerSeconds)}
              </p>
              {activeQuestion.double_reward_team_id != null && (
                <p className="arena-double-reward">⚡ DOUBLE REWARD ACTIVE</p>
              )}
            </div>
          )}

          {currentBids.length > 0 && (
            <div className="arena-bids-block">
              <p className="arena-panel-label">CURRENT BIDS</p>
              <div className="arena-bids-list">
                {currentBids.slice(0, 6).map((bid, i) => {
                  const team = teams.find((t) => t.id === bid.team_id);
                  return (
                    <div key={bid.id} className={`arena-bid-row ${i === 0 ? "arena-bid-top" : ""}`}>
                      <span
                        className="arena-bid-team"
                        style={{ color: team?.color ?? "var(--text-primary)" }}
                      >
                        {team?.name ?? `Team ${bid.team_id}`}
                      </span>
                      <span className="arena-bid-amount">
                        {bid.amount.toLocaleString()} QM
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeQuestion?.status === "SOLVING" && powerCards.length > 0 && (
            <div className="arena-pc-block">
              <p className="arena-panel-label">POWER CARDS</p>
              {powerCards.map((pc) => {
                const team = teams.find((t) => t.id === pc.team_id);
                if (!team) return null;
                return (
                  <div key={pc.team_id} className="arena-pc-row">
                    <span className="arena-pc-team" style={{ color: team.color ?? undefined }}>
                      {team.name}
                    </span>
                    <div className="arena-pc-tags">
                      <span className={`pc-tag ${pc.extra_time_used ? "pc-used" : "pc-available"}`}>+Time</span>
                      <span className={`pc-tag ${pc.double_reward_used ? "pc-used" : "pc-available"}`}>×2 RP</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <footer className="arena-footer">
        <span className="arena-brand">QUANTBID ARENA 2026</span>
        <span className="arena-footer-dot" />
        <span className="arena-footer-sub">LIVE</span>
      </footer>

      <DoorTransition isOpen={doorOpen} />
    </div>
  );
}
