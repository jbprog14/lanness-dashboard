// src/app/dashboard/StreamControlPanel.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";

/**
 * StreamControlPanel
 * ---------------------------------------------------------------------------
 * Operator-initiated live streaming control.
 *
 * The system default is on-demand capture (trigger -> capture -> upload ->
 * sleep). Continuous live video costs real cellular data, so it is opt-in:
 * a human explicitly starts it, and it auto-stops so a forgotten stream
 * cannot run all night.
 *
 * FRONTEND ONLY FOR NOW. The three places that will later write to Firebase
 * are marked with  // >>> BACKEND HOOK.  Nothing else needs to change.
 *
 * Intended Firebase shape when wired:
 *   lanness-tower-01/stream_request: {
 *     active:  boolean,
 *     camera:  "front" | "back",
 *     expires: <unix seconds>
 *   }
 * The Pi service (which already owns the camera) watches this flag and starts
 * publishing. Do NOT let a media server spawn its own camera process — it will
 * collide with the running service.
 */

const SESSION_SECONDS = 300; // 5 min initial session
const EXTEND_SECONDS = 180; // +3 min per extend
const MAX_SECONDS = 900; // hard ceiling, 15 min
const WARN_BELOW = 60; // countdown turns amber under 1 min

type Camera = "front" | "rear";

function formatClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StreamControlPanel() {
  const [streaming, setStreaming] = useState(false);
  const [camera, setCamera] = useState<Camera>("front");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(SESSION_SECONDS);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown. Auto-stops at zero so a forgotten stream can't run all night.
  useEffect(() => {
    if (!streaming) return;
    tickRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          stopStream("timeout");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  const startStream = () => {
    setSecondsLeft(SESSION_SECONDS);
    setSessionTotal(SESSION_SECONDS);
    setStreaming(true);
    // >>> BACKEND HOOK: PATCH stream_request { active: true, camera, expires }
  };

  const stopStream = (_reason: "operator" | "timeout") => {
    setStreaming(false);
    setSecondsLeft(0);
    if (tickRef.current) clearInterval(tickRef.current);
    // >>> BACKEND HOOK: PATCH stream_request { active: false }
  };

  const extendStream = () => {
    setSecondsLeft((prev) => Math.min(prev + EXTEND_SECONDS, MAX_SECONDS));
    setSessionTotal((prev) => Math.min(prev + EXTEND_SECONDS, MAX_SECONDS));
    // >>> BACKEND HOOK: PATCH stream_request { expires: <new expiry> }
  };

  const atCeiling = secondsLeft >= MAX_SECONDS;
  const running_low = streaming && secondsLeft <= WARN_BELOW;
  const barPct = sessionTotal > 0 ? (secondsLeft / sessionTotal) * 100 : 0;

  return (
    <div className="mt-6 bg-slate-900 border border-slate-800 rounded-lg p-5 font-mono text-xs">
      {/* header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${streaming ? "bg-red-500 animate-pulse" : "bg-slate-600"}`} />
          <h3 className="font-bold tracking-wider uppercase text-slate-300">Live Stream Control</h3>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider font-bold ${
            streaming ? "bg-red-950/40 border-red-900/50 text-red-400" : "bg-slate-950 border-slate-800 text-slate-500"
          }`}
        >
          {streaming ? "On air" : "Standby"}
        </span>
      </div>

      {/* camera selector — locked while streaming */}
      <div className="mb-4">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-2">Camera</span>
        <div className="grid grid-cols-2 gap-2">
          {(["front", "rear"] as const).map((cam) => (
            <button
              key={cam}
              onClick={() => setCamera(cam)}
              disabled={streaming}
              className={`py-2 text-[11px] font-bold uppercase tracking-wide rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                camera === cam
                  ? "bg-slate-800 border-slate-600 text-slate-100"
                  : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
              }`}
            >
              {cam}
            </button>
          ))}
        </div>
        {streaming && <p className="text-[10px] text-slate-600 mt-1.5 italic">Stop the stream to switch cameras.</p>}
      </div>

      {/* countdown — only while live */}
      {streaming && (
        <div className="mb-4">
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
              Stops automatically in
            </span>
            <span className={`text-lg font-bold tabular-nums ${running_low ? "text-amber-400" : "text-slate-100"}`}>
              {formatClock(secondsLeft)}
            </span>
          </div>
          <div className="w-full bg-slate-950 h-1.5 rounded overflow-hidden border border-slate-900">
            <div
              className={`h-full rounded-sm transition-all duration-1000 ease-linear ${
                running_low ? "bg-amber-500" : "bg-red-600"
              }`}
              style={{ width: `${barPct}%` }}
            />
          </div>
        </div>
      )}

      {/* PRIMARY CTA — start and stop occupy the same slot */}
      <button
        onClick={streaming ? () => stopStream("operator") : startStream}
        className={`w-full py-3 text-xs font-bold uppercase tracking-wide rounded border transition-colors ${
          streaming
            ? "bg-red-700 border-red-600 text-white hover:bg-red-600"
            : "bg-emerald-700 border-emerald-600 text-white hover:bg-emerald-600"
        }`}
      >
        {streaming ? "Stop stream" : "Start stream"}
      </button>

      {/* EXTEND — only meaningful while live */}
      {streaming && (
        <button
          onClick={extendStream}
          disabled={atCeiling}
          className="w-full mt-2 py-2 text-[11px] font-bold uppercase tracking-wide rounded border bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {atCeiling
            ? `Maximum ${Math.floor(MAX_SECONDS / 60)} min reached`
            : `Keep watching · add ${Math.floor(EXTEND_SECONDS / 60)} min`}
        </button>
      )}

      {/* cost note — make the expense visible */}
      <p className="text-[10px] text-amber-600/80 mt-3 text-center">
        Live streaming uses cellular data. Breach capture and alerts run without it.
      </p>
    </div>
  );
}
