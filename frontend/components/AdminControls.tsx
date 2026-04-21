"use client";

import { useState } from "react";
import type { Question, Team } from "@/types";

interface AdminControlsProps {
  question: Question | null;
  teams: Team[];
  onStartAuction: () => Promise<void>;
  onEndAuction: () => Promise<void>;
  onReAuction: () => Promise<void>;
  onCloseQuestion: () => Promise<void>;
  onSolve: (correct: boolean) => Promise<void>;
  onModifyTimer: (seconds: number) => Promise<void>;
  onConvertRP: (teamId: number) => Promise<void>;
  onPenalize: (teamId: number) => Promise<void>;
  busy: boolean;
}

export default function AdminControls({
  question,
  teams,
  onStartAuction,
  onEndAuction,
  onReAuction,
  onCloseQuestion,
  onSolve,
  onModifyTimer,
  onConvertRP,
  onPenalize,
  busy,
}: AdminControlsProps) {
  const [timerInput, setTimerInput] = useState("");
  const [convertTeamId, setConvertTeamId] = useState<number | "">("");
  const [penaltyTeamId, setPenaltyTeamId] = useState<number | "">("");

  if (!question) return null;

  const s = question.status;

  return (
    <div className="admin-controls">
      <p className="admin-title">Host Controls</p>

      {/* State Machine Actions */}
      <div className="admin-row">
        {s === "AVAILABLE" && (
          <button
            type="button"
            className="btn-admin-start"
            disabled={busy}
            onClick={onStartAuction}
          >
            Start Auction
          </button>
        )}
        {s === "BIDDING" && question.current_bid_team_id && (
          <button
            type="button"
            className="btn-admin-end"
            disabled={busy}
            onClick={onEndAuction}
          >
            End Auction
          </button>
        )}
        {s === "SOLVING" && (
          <>
            <button
              type="button"
              className="btn-admin-correct"
              disabled={busy}
              onClick={() => onSolve(true)}
            >
              Mark Correct
            </button>
            <button
              type="button"
              className="btn-admin-wrong"
              disabled={busy}
              onClick={() => onSolve(false)}
            >
              Mark Wrong / Timeout
            </button>
          </>
        )}
        {s === "FAILED" && (
          <>
            {question.re_auction_count < 1 && (
              <button
                type="button"
                className="btn-admin-reauction"
                disabled={busy}
                onClick={onReAuction}
              >
                Re-Auction
              </button>
            )}
            <button
              type="button"
              className="btn-admin-close"
              disabled={busy}
              onClick={onCloseQuestion}
            >
              Close Question
            </button>
          </>
        )}
        {!["SOLVED", "CLOSED", "FAILED"].includes(s) && (
          <button
            type="button"
            className="btn-admin-close-sm"
            disabled={busy}
            onClick={onCloseQuestion}
          >
            Close
          </button>
        )}
      </div>

      {/* Modify Timer */}
      {["BIDDING", "SOLVING", "AVAILABLE"].includes(s) && (
        <div className="admin-row admin-timer-row">
          <span className="admin-label">Set Timer (seconds):</span>
          <input
            type="number"
            className="admin-input"
            placeholder="e.g. 60"
            min={1}
            value={timerInput}
            onChange={(e) => setTimerInput(e.target.value)}
          />
          <button
            type="button"
            className="btn-admin-timer"
            disabled={busy || !timerInput || Number(timerInput) < 1}
            onClick={() => {
              onModifyTimer(Number(timerInput));
              setTimerInput("");
            }}
          >
            Apply
          </button>
        </div>
      )}

      {/* RP Conversion */}
      <div className="admin-row">
        <span className="admin-label">Convert 100 RP to 200 QM:</span>
        <select
          className="admin-select"
          value={convertTeamId}
          onChange={(e) =>
            setConvertTeamId(e.target.value === "" ? "" : Number(e.target.value))
          }
        >
          <option value="">Select team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.score} RP)
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-admin-convert"
          disabled={busy || convertTeamId === ""}
          onClick={() => {
            if (convertTeamId !== "") onConvertRP(Number(convertTeamId));
          }}
        >
          Convert
        </button>
      </div>

      {/* Penalty */}
      <div className="admin-row">
        <span className="admin-label admin-label-danger">Penalize (−100 RP):</span>
        <select
          className="admin-select"
          value={penaltyTeamId}
          onChange={(e) =>
            setPenaltyTeamId(e.target.value === "" ? "" : Number(e.target.value))
          }
        >
          <option value="">Select team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-admin-penalize"
          disabled={busy || penaltyTeamId === ""}
          onClick={() => {
            if (penaltyTeamId !== "") onPenalize(Number(penaltyTeamId));
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
