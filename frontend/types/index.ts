// ─────────────────────────────────────────────────────────
// QuantBid Arena — Frontend Type Definitions
// ─────────────────────────────────────────────────────────

export type QuestionStatus =
  | "AVAILABLE"
  | "BIDDING"
  | "SOLD"
  | "SOLVING"
  | "SOLVED"
  | "FAILED"
  | "RE_AUCTION_PENDING"
  | "CLOSED";

export type Question = {
  id: number;
  question_text: string;
  answer_text: string | null;
  options: string[] | null;
  reward_points: number;
  base_amount: number;
  time_limit_seconds: number;
  active_time_seconds: number | null;
  solve_started_at: string | null; // ISO timestamp
  is_used: boolean;
  status: QuestionStatus;
  category: string | null;
  difficulty: string | null;
  assigned_team_id: number | null;
  current_bid_amount: number | null;
  current_bid_team_id: number | null;
  original_base_price: number | null;
  original_reward_points: number | null;
  original_time_limit: number | null;
  re_auction_count: number;
  excluded_team_ids: number[];
  double_reward_team_id: number | null;
};

export type Team = {
  id: number;
  name: string;
  score: number;   // Reward Points (RP)
  balance: number; // Quant Money (QM)
  color: string | null;
};

export type Bid = {
  id: number;
  question_id: number;
  team_id: number;
  amount: number;
  placed_at: string;
};

export type PowerCard = {
  id: number;
  team_id: number;
  extra_time_used: boolean;
  double_reward_used: boolean;
};

export type RandomAssignment = {
  question_id: number;
  team_id: number;
  team_name: string;
};

export type GameState = {
  questions: Question[];
  teams: Team[];
  bids: Bid[];
  power_cards: PowerCard[];
};
