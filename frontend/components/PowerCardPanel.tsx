"use client";

import type { PowerCard, Question, Team } from "@/types";

interface PowerCardPanelProps {
  question: Question;
  teams: Team[];
  powerCards: PowerCard[];
  onExtraTime: (teamId: number) => Promise<unknown>;
  onDoubleReward: (teamId: number) => Promise<unknown>;
  busy: boolean;
}

export default function PowerCardPanel({
  question,
  teams,
  powerCards,
  onExtraTime,
  onDoubleReward,
  busy,
}: PowerCardPanelProps) {
  const winningTeamId = question.assigned_team_id;
  if (winningTeamId == null) return null;
  if (question.status !== "SOLVING") return null;

  const winningTeam = teams.find((t) => t.id === winningTeamId);
  const pc = powerCards.find((p) => p.team_id === winningTeamId);
  const doubleActive = question.double_reward_team_id === winningTeamId;

  return (
    <div className="power-card-panel">
      <p className="pc-title">
        Power Cards — {winningTeam?.name ?? "Solving Team"}
      </p>

      {doubleActive && (
        <div className="pc-active-badge">Double Reward Active</div>
      )}

      <div className="pc-buttons">
        <div className="pc-card">
          <p className="pc-card-name">Extra 1 Minute</p>
          <p className="pc-card-desc">Adds +60 seconds to solving timer</p>
          <button
            type="button"
            className="btn-power"
            disabled={pc?.extra_time_used || busy}
            onClick={() => onExtraTime(winningTeamId)}
          >
            {pc?.extra_time_used ? "Used" : "Use Card"}
          </button>
        </div>

        <div className="pc-card">
          <p className="pc-card-name">Double Reward</p>
          <p className="pc-card-desc">
            Correct: 2x RP &nbsp;|&nbsp; Wrong: 2x bid deducted
          </p>
          <button
            type="button"
            className="btn-power"
            disabled={pc?.double_reward_used || busy || doubleActive}
            onClick={() => onDoubleReward(winningTeamId)}
          >
            {pc?.double_reward_used || doubleActive ? "Active" : "Use Card"}
          </button>
        </div>
      </div>
    </div>
  );
}
