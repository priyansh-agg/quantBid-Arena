import type { GameState, PowerCard, Question, Team } from "@/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch { /* ignore */ }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

// ── Questions ─────────────────────────────────────────────
export const getQuestions = (): Promise<Question[]> =>
  apiFetch<Question[]>("/api/questions");

export const getQuestion = (id: number): Promise<Question> =>
  apiFetch<Question>(`/api/questions/${id}`);

export const markQuestionUsage = (id: number, isUsed: boolean): Promise<Question> =>
  apiFetch<Question>(`/api/questions/${id}/usage`, {
    method: "PATCH",
    body: JSON.stringify({ is_used: isUsed }),
  });

export const startAuction = (questionId: number): Promise<Question> =>
  apiFetch<Question>(`/api/questions/${questionId}/start-auction`, { method: "POST", body: "{}" });

export const solveQuestion = (questionId: number, correct: boolean): Promise<Question> =>
  apiFetch<Question>(`/api/questions/${questionId}/solve`, {
    method: "POST",
    body: JSON.stringify({ correct }),
  });

export const modifyTimer = (questionId: number, seconds: number): Promise<Question> =>
  apiFetch<Question>(`/api/questions/${questionId}/timer`, {
    method: "PATCH",
    body: JSON.stringify({ seconds }),
  });

// ── Auctions ──────────────────────────────────────────────
export const placeBid = (
  questionId: number,
  teamId: number,
  amount: number
): Promise<Question> =>
  apiFetch<Question>(`/api/auctions/${questionId}/bid`, {
    method: "POST",
    body: JSON.stringify({ team_id: teamId, amount }),
  });

export const endAuction = (questionId: number): Promise<Question> =>
  apiFetch<Question>(`/api/auctions/${questionId}/end`, { method: "POST", body: "{}" });

export const triggerReAuction = (questionId: number): Promise<Question> =>
  apiFetch<Question>(`/api/auctions/${questionId}/re-auction`, { method: "POST", body: "{}" });

export const closeQuestion = (questionId: number): Promise<Question> =>
  apiFetch<Question>(`/api/auctions/${questionId}/close`, { method: "POST", body: "{}" });

// ── Teams ─────────────────────────────────────────────────
export const getTeams = (): Promise<Team[]> =>
  apiFetch<Team[]>("/api/teams");

export const updateTeamScore = (teamId: number, delta: number): Promise<Team> =>
  apiFetch<Team>(`/api/teams/${teamId}/score`, {
    method: "PATCH",
    body: JSON.stringify({ delta }),
  });

export const convertRP = (teamId: number, amountRp: number = 100): Promise<Team> =>
  apiFetch<Team>(`/api/teams/${teamId}/convert-rp`, {
    method: "POST",
    body: JSON.stringify({ amount_rp: amountRp }),
  });

export const penalizeTeam = (teamId: number): Promise<Team> =>
  apiFetch<Team>(`/api/teams/${teamId}/penalize`, { method: "POST", body: "{}" });

// ── Power Cards ───────────────────────────────────────────
export const getPowerCards = (): Promise<PowerCard[]> =>
  apiFetch<PowerCard[]>("/api/power-cards");

export const useExtraTime = (teamId: number, questionId: number): Promise<PowerCard> =>
  apiFetch<PowerCard>(`/api/power-cards/${teamId}/extra-time`, {
    method: "POST",
    body: JSON.stringify({ question_id: questionId }),
  });

export const useDoubleReward = (teamId: number, questionId: number): Promise<PowerCard> =>
  apiFetch<PowerCard>(`/api/power-cards/${teamId}/double-reward`, {
    method: "POST",
    body: JSON.stringify({ question_id: questionId }),
  });

// ── Admin ─────────────────────────────────────────────────
export const resetGame = (): Promise<{ status: string; message: string }> =>
  apiFetch("/api/admin/reset-game", { method: "POST", body: "{}" });

export async function fetchGameState(): Promise<GameState> {
  const [questions, teams, power_cards] = await Promise.all([
    getQuestions(),
    getTeams(),
    getPowerCards(),
  ]);
  return { questions, teams, bids: [], power_cards };
}

// ── Phase control (HTTP fallback for host panel) ──────────
export const setPhaseTransition = (meme_text?: string): Promise<{ phase: string; meme_text: string; current_question_id: number | null }> =>
  apiFetch("/api/phase/transition", {
    method: "POST",
    body: JSON.stringify({ meme_text: meme_text ?? null }),
  });

export const setPhaseQuestion = (): Promise<{ phase: string; meme_text: string; current_question_id: number | null }> =>
  apiFetch("/api/phase/question", { method: "POST", body: "{}" });

export const getPhase = (): Promise<{ phase: string; meme_text: string; current_question_id: number | null }> =>
  apiFetch("/api/phase");

export const setCurrentQuestion = (question_id: number | null): Promise<{ phase: string; meme_text: string; current_question_id: number | null }> =>
  apiFetch("/api/phase/set-question", {
    method: "POST",
    body: JSON.stringify({ question_id }),
  });
