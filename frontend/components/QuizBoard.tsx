"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  closeQuestion,
  convertRP,
  endAuction,
  modifyTimer,
  penalizeTeam,
  placeBid,
  resetGame,
  solveQuestion,
  startAuction,
  triggerReAuction,
  updateTeamScore,
  useDoubleReward as activateDoubleRewardCard,
  useExtraTime as activateExtraTimeCard,
} from "@/lib/api";
import { useGameWebSocket } from "@/lib/websocket";
import type { Bid, GameState, PowerCard, Question, QuestionStatus, Team } from "@/types";
import AdminControls from "@/components/AdminControls";
import BiddingPanel from "@/components/BiddingPanel";
import ParticlesBackdrop from "@/components/ParticlesBackdrop";
import PowerCardPanel from "@/components/PowerCardPanel";

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
    BIDDING: "Bidding",
    SOLD: "Sold",
    SOLVING: "Solving",
    SOLVED: "Solved",
    FAILED: "Failed",
    RE_AUCTION_PENDING: "Re-Auction Pending",
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

function pillClass(q: Question, selectedId: number | null): string {
  const parts = ["question-pill"];
  if (q.id === selectedId) parts.push("selected");
  if (q.is_used || q.status === "SOLVED" || q.status === "CLOSED") parts.push("used");
  if (q.status === "BIDDING") parts.push("pill-bidding");
  if (q.status === "SOLVING") parts.push("pill-solving");
  if (q.status === "FAILED") parts.push("pill-failed");
  return parts.join(" ");
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

const STATUS_ORDER: QuestionStatus[] = [
  "BIDDING", "SOLVING", "FAILED", "AVAILABLE", "SOLD", "SOLVED", "CLOSED",
];

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export default function QuizBoard() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [powerCards, setPowerCards] = useState<PowerCard[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);

  const selectedQuestion = useMemo(
    () => questions.find((q) => q.id === selectedId) ?? null,
    [questions, selectedId]
  );

  const sortedQuestions = useMemo(() => {
    return [...questions].sort((a, b) => {
      const ai = STATUS_ORDER.indexOf(a.status);
      const bi = STATUS_ORDER.indexOf(b.status);
      if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.id - b.id;
    });
  }, [questions]);

  const leaderboard = useMemo(
    () =>
      [...teams].sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.name.localeCompare(b.name)
      ),
    [teams]
  );

  // ── WebSocket ───────────────────────────────────────────
  const handleState = useCallback((state: GameState) => {
    setQuestions(state.questions);
    setTeams(state.teams);
    setBids(state.bids);
    setPowerCards(state.power_cards);
    setLoading(false);

    setSelectedId((prev) => {
      if (prev != null && state.questions.some((q) => q.id === prev)) return prev;
      const active = state.questions.find((q) =>
        ["BIDDING", "SOLVING", "FAILED"].includes(q.status)
      );
      return active?.id ?? state.questions[0]?.id ?? null;
    });
  }, []);

  const connectionStatus = useGameWebSocket(handleState);

  // ── Live timer ──────────────────────────────────────────
  const prevSolvedRef = useRef(0);
  useEffect(() => {
    const solvedCount = questions.filter((q) => q.status === "SOLVED").length;
    prevSolvedRef.current = solvedCount;
  }, [questions]);

  useEffect(() => {
    if (!selectedQuestion) return;
    setTimerSeconds(computeRemainingSeconds(selectedQuestion));
    if (selectedQuestion.status !== "SOLVING") return;
    const id = setInterval(() => {
      setTimerSeconds(computeRemainingSeconds(selectedQuestion));
    }, 500);
    return () => clearInterval(id);
  }, [selectedQuestion]);

  useEffect(() => setShowAnswer(false), [selectedId]);

  const handleReset = async () => {
    const confirmed = window.confirm(
      "Reset the entire game?\n\nThis will:\n- Set all questions back to AVAILABLE\n- Reset all team scores and QM to 0 / 10,000\n- Clear all bids and power cards"
    );
    if (!confirmed) return;
    await act("Game reset — all questions and teams are fresh", () => resetGame());
  };

  // Auto-dismiss notifications after 4s
  useEffect(() => {
    if (!statusMsg) return;
    const t = setTimeout(() => setStatusMsg(null), 4000);
    return () => clearTimeout(t);
  }, [statusMsg]);

  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => setErrorMsg(null), 6000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  // ── Action wrapper ──────────────────────────────────────
  async function act<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const result = await fn();
      setStatusMsg(label);
      return result;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : `${label} failed.`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ── Handlers ────────────────────────────────────────────
  const handleStartAuction = () =>
    act("Auction started", () => startAuction(selectedId!));
  const handleEndAuction = () =>
    act("Auction ended — solving begins", () => endAuction(selectedId!));
  const handleBid = (teamId: number, amount: number) =>
    act(`Bid placed: ${amount} QM`, () => placeBid(selectedId!, teamId, amount));
  const handleSolve = (correct: boolean) =>
    act(correct ? "Marked correct — RP awarded" : "Marked wrong — question failed", () =>
      solveQuestion(selectedId!, correct)
    );
  const handleReAuction = () =>
    act("Re-auction triggered", () => triggerReAuction(selectedId!));
  const handleClose = () =>
    act("Question closed", () => closeQuestion(selectedId!));
  const handleModifyTimer = (seconds: number) =>
    act(`Timer set to ${seconds}s`, () => modifyTimer(selectedId!, seconds));
  const handleExtraTime = (teamId: number) =>
    act("Extra time used", () => activateExtraTimeCard(teamId, selectedId!));
  const handleDoubleReward = (teamId: number) =>
    act("Double Reward activated", () => activateDoubleRewardCard(teamId, selectedId!));
  const handleConvertRP = (teamId: number) =>
    act("100 RP converted to 200 QM", () => convertRP(teamId, 100));
  const handlePenalize = (teamId: number) =>
    act("100 RP penalty applied", () => penalizeTeam(teamId));
  const handleScoreAdjust = (teamId: number, delta: number) =>
    act(`Score adjusted by ${delta > 0 ? "+" : ""}${delta}`, () => updateTeamScore(teamId, delta));

  // ── Render ──────────────────────────────────────────────
  const assignedTeam = selectedQuestion
    ? teams.find((t) => t.id === selectedQuestion.assigned_team_id)
    : null;

  return (
    <div className="app-shell">
      <ParticlesBackdrop />
      <div className="ambient-grid" />

      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <span className="header-eyebrow">Live Control Room</span>
          <h1>QuantBid Arena</h1>
          <p className="header-sub">Real-time auction engine · Competitive mathematics platform</p>
        </div>
        <div className="header-right">
          <button
            type="button"
            className="btn-reset-game"
            disabled={busy}
            onClick={handleReset}
          >
            Reset Game
          </button>
          <div className="header-status">
            <span
              className={`ws-dot ${
                connectionStatus === "connected"
                  ? "ws-connected"
                  : connectionStatus === "connecting"
                  ? "ws-connecting"
                  : "ws-disconnected"
              }`}
            />
            <span className="ws-label">
              {connectionStatus === "connected"
                ? "Live"
                : connectionStatus === "connecting"
                ? "Connecting"
                : "Disconnected"}
            </span>
          </div>
        </div>
      </header>

      <main className="board-grid">
        {/* ── Left: Question Palette ── */}
        <aside className="panel left-panel">
          <div className="panel-head">
            <h2>Questions</h2>
            <span className="panel-meta">{questions.length} total</span>
          </div>
          <div className="question-grid">
            {sortedQuestions.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelectedId(q.id)}
                className={pillClass(q, selectedId)}
              >
                <span className="pill-id">Q{q.id}</span>
                <span className={`pill-status-dot ${statusClass(q.status)}`} />
                <span className="pill-rp">{q.reward_points} RP</span>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Middle: Question View ── */}
        <section className="panel middle-panel">
          <div className="panel-head">
            <h2>Question View</h2>
            {selectedQuestion && (
              <span className={`status-badge ${statusClass(selectedQuestion.status)}`}>
                {statusLabel(selectedQuestion.status, selectedQuestion.re_auction_count)}
              </span>
            )}
          </div>

          {loading ? (
            <div className="empty-state">Connecting to game engine…</div>
          ) : !selectedQuestion ? (
            <div className="empty-state">Select a question from the left panel.</div>
          ) : (
            <>
              {/* Meta chips */}
              <div className="chip-row">
                <span className="chip">
                  {selectedQuestion.re_auction_count > 0
                    ? `RP: ${selectedQuestion.reward_points} (orig: ${selectedQuestion.original_reward_points})`
                    : `RP: ${selectedQuestion.reward_points}`}
                </span>
                <span className="chip">
                  {selectedQuestion.re_auction_count > 0
                    ? `Base: ${selectedQuestion.base_amount} QM (orig: ${selectedQuestion.original_base_price})`
                    : `Base: ${selectedQuestion.base_amount} QM`}
                </span>
                <span className="chip">
                  Time: {selectedQuestion.active_time_seconds ?? selectedQuestion.time_limit_seconds}s
                </span>
                {selectedQuestion.category && (
                  <span className="chip">{selectedQuestion.category}</span>
                )}
                {selectedQuestion.difficulty && (
                  <span className="chip">{selectedQuestion.difficulty}</span>
                )}
              </div>

              {/* Question text */}
              <article className="question-card">
                <h3>{selectedQuestion.question_text}</h3>
                {selectedQuestion.options && selectedQuestion.options.length > 0 ? (
                  <ol className="option-list">
                    {selectedQuestion.options.map((opt, i) => (
                      <li key={i}>{opt}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="subtle">Open-ended question.</p>
                )}
              </article>

              {/* Timer */}
              {["BIDDING", "SOLVING"].includes(selectedQuestion.status) && (
                <section className="timer-card">
                  <p className="timer-label">
                    {selectedQuestion.status === "SOLVING" ? "Solving Timer" : "Configured Time"}
                  </p>
                  <p
                    className={`timer-value ${
                      timerSeconds <= 10 && selectedQuestion.status === "SOLVING"
                        ? "timer-critical"
                        : ""
                    }`}
                  >
                    {formatTime(timerSeconds)}
                  </p>
                  {selectedQuestion.double_reward_team_id != null && (
                    <p className="double-reward-indicator">Double Reward Active</p>
                  )}
                </section>
              )}

              {/* Bidding Panel */}
              {selectedQuestion.status === "BIDDING" && (
                <BiddingPanel
                  question={selectedQuestion}
                  teams={teams}
                  bids={bids}
                  onBid={handleBid}
                  onEndAuction={handleEndAuction}
                  busy={busy}
                />
              )}

              {/* Power Cards */}
              {selectedQuestion.status === "SOLVING" && (
                <PowerCardPanel
                  question={selectedQuestion}
                  teams={teams}
                  powerCards={powerCards}
                  onExtraTime={handleExtraTime}
                  onDoubleReward={handleDoubleReward}
                  busy={busy}
                />
              )}

              {/* Solving info */}
              {selectedQuestion.status === "SOLVING" && assignedTeam && (
                <div className="assigned-info">
                  <span className="assigned-label">Solving:</span>
                  <span
                    className="assigned-team"
                    style={{ color: assignedTeam.color ?? "var(--accent-2)" }}
                  >
                    {assignedTeam.name}
                  </span>
                  <span className="assigned-detail">
                    Paid {selectedQuestion.current_bid_amount?.toLocaleString()} QM
                  </span>
                </div>
              )}

              {/* Failed banner */}
              {selectedQuestion.status === "FAILED" && (
                <div className="failed-banner">
                  <strong>Question Failed</strong>
                  {" — "}
                  {teams.find((t) => t.id === selectedQuestion.assigned_team_id)?.name ?? "Team"} did not answer correctly.
                  <br />
                  Use Host Controls below to re-auction or close.
                </div>
              )}

              {/* Reveal answer */}
              <section className="action-card">
                <button
                  type="button"
                  className="btn-reveal"
                  onClick={() => setShowAnswer((p) => !p)}
                >
                  {showAnswer ? "Hide Answer" : "Reveal Answer"}
                </button>
                {showAnswer && (
                  <div className="answer-card">
                    <p className="answer-label">Answer</p>
                    <p className="answer-text">
                      {selectedQuestion.answer_text ?? "Answer not set."}
                    </p>
                  </div>
                )}
              </section>

              {/* Admin Controls */}
              <AdminControls
                question={selectedQuestion}
                teams={teams}
                onStartAuction={handleStartAuction}
                onEndAuction={handleEndAuction}
                onReAuction={handleReAuction}
                onCloseQuestion={handleClose}
                onSolve={handleSolve}
                onModifyTimer={handleModifyTimer}
                onConvertRP={handleConvertRP}
                onPenalize={handlePenalize}
                busy={busy}
              />
            </>
          )}
        </section>

        {/* ── Right: Leaderboard ── */}
        <aside className="panel right-panel">
          <div className="panel-head">
            <h2>Leaderboard</h2>
            <span className="panel-meta">{teams.length} teams</span>
          </div>

          <div className="leaderboard-list">
            {leaderboard.map((team, index) => {
              const pc = powerCards.find((p) => p.team_id === team.id);
              return (
                <article
                  key={team.id}
                  className="team-card"
                  style={{ borderLeftColor: team.color ?? "var(--line)" }}
                >
                  <div className="team-rank">{index + 1}</div>
                  <div className="team-info">
                    <h3
                      className="team-name"
                      style={{ color: team.color ?? "var(--text)" }}
                    >
                      {team.name}
                    </h3>
                    <div className="team-pc-row">
                      <span
                        className={`pc-tag ${pc?.extra_time_used ? "pc-used" : "pc-available"}`}
                      >
                        Extra Time
                      </span>
                      <span
                        className={`pc-tag ${pc?.double_reward_used ? "pc-used" : "pc-available"}`}
                      >
                        Double Reward
                      </span>
                    </div>
                  </div>
                  <div className="team-scores">
                    <p className="team-score-rp">{team.score} RP</p>
                    <p className="team-score-qm">{team.balance.toLocaleString()} QM</p>
                  </div>
                  <div className="team-actions">
                    <button
                      type="button"
                      className="btn-score-pos"
                      onClick={() => handleScoreAdjust(team.id, 10)}
                      disabled={busy}
                    >
                      +10 RP
                    </button>
                    <button
                      type="button"
                      className="btn-score-neg"
                      onClick={() => handleScoreAdjust(team.id, -10)}
                      disabled={busy}
                    >
                      −10 RP
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>
      </main>

      {/* Notification toasts */}
      {(statusMsg || errorMsg) && (
        <div className="toast-container">
          {statusMsg && <p className="toast toast-success">{statusMsg}</p>}
          {errorMsg && <p className="toast toast-error">{errorMsg}</p>}
        </div>
      )}
    </div>
  );
}
