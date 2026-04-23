"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "@/types";
import { fetchGameState } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

// Convert http(s):// → ws(s):// automatically — only one env var needed
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws/game";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export type PhaseType = "QUESTION" | "TRANSITION" | "WINNER" | "WRONG";

export type PhaseState = {
  phase: PhaseType;
  meme_text: string;
  current_question_id: number | null;
  winner_info: {
    team_name?: string;
    team_color?: string;
    question_id?: number;
  };
};

// ── Callbacks ─────────────────────────────────────────────

type WsCallbacks = {
  onState: (state: GameState) => void;
  onPhase?: (phase: PhaseState) => void;
};

export function useGameWebSocket(
  onState: (state: GameState) => void,
  onPhase?: (phase: PhaseState) => void,
) {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  // Keep callbacks in a ref so connect() doesn't need them as deps
  const cbRef = useRef<WsCallbacks>({ onState, onPhase });
  cbRef.current = { onState, onPhase };

  const clearTimers = useCallback(() => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
  }, []);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus("connecting");

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      setConnectionStatus("connected");

      // Keepalive ping every 20 s
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 20_000);
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;
      if (event.data === "pong") return;
      try {
        const msg = JSON.parse(event.data as string);

        // ── Phase-only message (lightweight) ──
        if (msg.type === "phase") {
          cbRef.current.onPhase?.({
            phase: msg.phase ?? "QUESTION",
            meme_text: msg.meme_text ?? "",
            current_question_id: msg.current_question_id ?? null,
            winner_info: msg.winner_info ?? {},
          });
          return;
        }

        // ── Full state message ──
        if (msg.type === "state") {
          cbRef.current.onState({
            questions: msg.questions ?? [],
            teams: msg.teams ?? [],
            bids: msg.bids ?? [],
            power_cards: msg.power_cards ?? [],
            current_question_id: msg.current_question_id ?? null,
            phase: msg.phase,
          });
          // Full state also carries phase — propagate it
          if (msg.phase !== undefined) {
            cbRef.current.onPhase?.({
              phase: msg.phase ?? "QUESTION",
              meme_text: msg.meme_text ?? "",
              current_question_id: msg.current_question_id ?? null,
              winner_info: msg.winner_info ?? {},
            });
          }
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      clearTimers();
      if (!isMountedRef.current) return;
      setConnectionStatus("disconnected");
      // Reconnect after 3 s
      reconnectTimeoutRef.current = setTimeout(connect, 3_000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [clearTimers]);

  // Expose send so host panel can send phase commands over WS
  const send = useCallback((data: object | string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === "string" ? data : JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    // Initial connect
    connect();

    // Fallback poll every 8 s (in case WS drops)
    const pollId = setInterval(async () => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        try {
          const state = await fetchGameState();
          if (isMountedRef.current) cbRef.current.onState(state);
        } catch { /* ignore */ }
      }
    }, 8_000);

    return () => {
      isMountedRef.current = false;
      clearTimers();
      clearInterval(pollId);
      wsRef.current?.close();
    };
  }, [connect, clearTimers]);

  return { connectionStatus, send };
}
