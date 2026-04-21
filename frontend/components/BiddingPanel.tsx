"use client";

import React, { useState, useEffect } from "react";
import type { Bid, Question, Team } from "@/types";
import { getMinIncrement } from "@/lib/bidUtils";

interface BiddingPanelProps {
  question: Question;
  teams: Team[];
  bids: Bid[];
  onBid: (teamId: number, amount: number) => Promise<unknown>;
  onEndAuction: () => Promise<unknown>;
  busy: boolean;
}

export default function BiddingPanel({
  question,
  teams,
  bids,
  onBid,
  onEndAuction,
  busy,
}: BiddingPanelProps) {
  const questionBids = bids
    .filter((b) => b.question_id === question.id)
    .sort((a, b) => b.amount - a.amount);

  const currentBid = question.current_bid_amount ?? question.base_amount;
  const currentBidTeam = teams.find((t) => t.id === question.current_bid_team_id);
  const minNext =
    question.current_bid_team_id != null
      ? currentBid + getMinIncrement(currentBid)
      : currentBid;

  const excluded = question.excluded_team_ids ?? [];
  const eligibleTeams = teams.filter((t) => !excluded.includes(t.id));

  return (
    <div className="bidding-panel">
      {question.re_auction_count > 0 && (
        <div className="re-auction-badge">
          RE-AUCTION ROUND — Values Halved
        </div>
      )}

      <div className="current-bid-display">
        <p className="bid-label">
          {question.current_bid_team_id ? "Highest Bid" : "Starting Price"}
        </p>
        <p className="bid-value">{currentBid.toLocaleString()} QM</p>
        {currentBidTeam && (
          <p className="bid-team" style={{ color: currentBidTeam.color ?? "var(--accent-2)" }}>
            {currentBidTeam.name}
          </p>
        )}
        <p className="bid-hint">
          Min next bid:{" "}
          <strong style={{ color: "var(--warning)" }}>
            {minNext.toLocaleString()} QM
          </strong>
          {" "}(+{getMinIncrement(currentBid)} increment)
        </p>
      </div>

      {questionBids.length > 0 && (
        <div className="bid-history">
          <p className="bid-history-title">Bid History</p>
          <div className="bid-history-list">
            {questionBids.slice(0, 6).map((bid) => {
              const team = teams.find((t) => t.id === bid.team_id);
              return (
                <div key={bid.id} className="bid-history-row">
                  <span style={{ color: team?.color ?? "var(--accent)" }}>
                    {team?.name ?? `Team ${bid.team_id}`}
                  </span>
                  <span className="bid-history-amt">
                    {bid.amount.toLocaleString()} QM
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="team-bid-grid">
        {eligibleTeams.map((team) => (
          <TeamBidRow
            key={team.id}
            team={team}
            minAmount={minNext}
            busy={busy}
            onBid={(amount) => onBid(team.id, amount)}
          />
        ))}
      </div>

      {question.current_bid_team_id && (
        <button
          type="button"
          className="btn-end-auction"
          disabled={busy}
          onClick={onEndAuction}
        >
          End Auction — Award to {currentBidTeam?.name ?? "Winner"}
        </button>
      )}

      {excluded.length > 0 && (
        <p className="excluded-label">
          Excluded:{" "}
          {excluded
            .map((id) => teams.find((t) => t.id === id)?.name ?? `ID ${id}`)
            .join(", ")}
        </p>
      )}
    </div>
  );
}

function TeamBidRow({
  team,
  minAmount,
  busy,
  onBid,
}: {
  team: Team;
  minAmount: number;
  busy: boolean;
  onBid: (amount: number) => void;
}) {
  const [value, setValue] = useState(String(minAmount));

  useEffect(() => {
    setValue(String(minAmount));
  }, [minAmount]);

  const parsed = Number(value);
  const valid = Number.isFinite(parsed) && parsed >= minAmount && parsed <= team.balance;

  return (
    <div className="team-bid-row" style={{ borderColor: team.color ?? "var(--line)" }}>
      <span className="tbr-name" style={{ color: team.color ?? "var(--text)" }}>
        {team.name}
      </span>
      <span className="tbr-balance">{team.balance.toLocaleString()} QM</span>
      <input
        type="number"
        className="tbr-input"
        min={minAmount}
        max={team.balance}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="button"
        className="btn-bid"
        disabled={!valid || busy}
        onClick={() => onBid(parsed)}
      >
        Bid
      </button>
    </div>
  );
}
