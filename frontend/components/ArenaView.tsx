"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameWebSocket, type PhaseState } from "@/lib/websocket";
import type { Bid, GameState, PowerCard, Question, QuestionStatus, Team } from "@/types";

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
  const [phase, setPhase] = useState<"QUESTION" | "TRANSITION">("QUESTION");
  const [memeText, setMemeText] = useState("INITIALIZING ARENA");
  const [currentQuestionId, setCurrentQuestionId] = useState<number | null>(null);

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
    // Sync the server-pinned question id (may be null if host hasn't set one)
    setCurrentQuestionId(ps.current_question_id);
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

  // ── Render ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="arena-shell">
        <div className="ambient-grid" />
        <div className="arena-loading">
          <div className="spinner" />
          <p className="meme-text">CONNECTING TO ARENA_</p>
        </div>
      </div>
    );
  }

  // TRANSITION phase — host-controlled meme screen
  if (phase === "TRANSITION") {
    return (
      <div className="arena-shell arena-shell--transition">
        <div className="ambient-grid" />
        <div className="math-bg" aria-hidden="true">
          <span>∫ e^x dx = e^x + C</span>
          <span>E = mc²</span>
          <span>∑ (1/n²) = π²/6</span>
          <span>e^(iπ) + 1 = 0</span>
          <span>∇ × B = μ₀J + μ₀ε₀(∂E/∂t)</span>
          <span>f(x) = a₀/2 + ∑(aₙcos(nx) + bₙsin(nx))</span>
        </div>

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

          <div className="meme-leaderboard-strip">
            {leaderboard.slice(0, 5).map((team, i) => (
              <div key={team.id} className="meme-lb-item">
                <span style={{ color: RANK_COLORS[i] ?? "var(--text-muted)" }}>
                  #{i + 1}
                </span>
                <span
                  className="meme-lb-name"
                  style={{ color: team.color ?? "var(--text-primary)" }}
                >
                  {team.name}
                </span>
                <span className="meme-lb-score">{team.score} RP</span>
              </div>
            ))}
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
      <div className="ambient-grid" />
      <div className="math-bg" aria-hidden="true">
        <span>∫ e^x dx = e^x + C</span>
        <span>E = mc²</span>
        <span>∑ (1/n²) = π²/6</span>
        <span>e^(iπ) + 1 = 0</span>
        <span>∇ × B = μ₀J + μ₀ε₀(∂E/∂t)</span>
        <span>f(x) = a₀/2 + ∑(aₙcos(nx) + bₙsin(nx))</span>
      </div>

      <div className="arena-grid">
        {/* ── LEFT: Leaderboard ── */}
        <aside className="arena-leaderboard">
          <div className="arena-panel-head">
            <span className="arena-panel-label">LEADERBOARD</span>
            <span className="arena-panel-sub">{teams.length} TEAMS</span>
          </div>
          <div className="arena-lb-list">
            {leaderboard.map((team, i) => (
              <div
                key={team.id}
                className={`arena-lb-row ${i === 0 ? "arena-lb-gold" : i === 1 ? "arena-lb-silver" : i === 2 ? "arena-lb-bronze" : ""}`}
              >
                <span
                  className="arena-lb-rank"
                  style={{ color: RANK_COLORS[i] ?? "var(--text-muted)" }}
                >
                  {i + 1}
                </span>
                <div className="arena-lb-info">
                  <span
                    className="arena-lb-name"
                    style={{ color: team.color ?? "var(--text-primary)" }}
                  >
                    {team.name}
                  </span>
                  <span className="arena-lb-qm">
                    {team.balance.toLocaleString()} QM
                  </span>
                </div>
                <span className="arena-lb-score">{team.score} RP</span>
              </div>
            ))}
          </div>
        </aside>

        {/* ── CENTER: Question Spotlight ── */}
        <main className="arena-center">
          {activeQuestion ? (
            <>
              <div className="arena-status-row">
                <span className={`status-badge ${statusClass(activeQuestion.status)}`}>
                  {statusLabel(activeQuestion.status, activeQuestion.re_auction_count)}
                </span>
                <span className="arena-q-id">Q{activeQuestion.id}</span>
              </div>

              <div className="arena-question-block">
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

              {activeQuestion.status === "SOLVING" && assignedTeam && (
                <div className="arena-solving-bar">
                  <span className="arena-solving-label">SOLVING →</span>
                  <span
                    className="arena-solving-team"
                    style={{ color: assignedTeam.color ?? "var(--accent)" }}
                  >
                    {assignedTeam.name}
                  </span>
                  <span className="arena-solving-bid">
                    {activeQuestion.current_bid_amount?.toLocaleString()} QM
                  </span>
                </div>
              )}

              <div className="arena-meta-row">
                <span className="arena-chip">{activeQuestion.reward_points} RP</span>
                <span className="arena-chip">Base {activeQuestion.base_amount} QM</span>
                {activeQuestion.category && <span className="arena-chip">{activeQuestion.category}</span>}
                {activeQuestion.difficulty && <span className="arena-chip">{activeQuestion.difficulty}</span>}
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
    </div>
  );
}
