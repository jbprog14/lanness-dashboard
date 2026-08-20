// src/app/dashboard/ZonePanel.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * ZonePanel
 * ---------------------------------------------------------------------------
 * One perimeter zone: its camera and its acoustic array, together.
 *
 * WHY PAIRED
 *   The old N/S/E/W selector implied four cameras that never existed — every
 *   button showed the same feed. The hardware is actually two zones, each with
 *   a dish-mounted mic array and a camera, matching the turnover document's
 *   Front/Rear naming and the detector GUI's Zone A / Zone B.
 *
 * DATA
 *   Reads liveTelemetry.metrics.zones[zoneId] when present. Falls back to the
 *   flat acoustic_* fields for the front zone, which is what lannes_alert.py
 *   currently publishes — so this works today and needs no change when the Pi
 *   moves to per-zone telemetry.
 *
 *   Absorbs what AcousticMonitorPanel showed, so that panel can be removed.
 *
 * NO BEARING
 *   The spectral-tilt detector reads one channel and returns one number. There
 *   is no direction of arrival, so nothing here draws a radar sweep.
 */

const THRESHOLD_DB = -18.0; // keep in sync with lannes_alert.py
const SCALE_MIN = -35;
const SCALE_MAX = 5;
const TRACE_POINTS = 40;

interface Props {
  label: string;
  zoneId: "front" | "rear";
  liveTelemetry: any;
  enabled?: boolean;
  children?: React.ReactNode; // camera feed, when hardware exists
}

export default function ZonePanel({ label, zoneId, liveTelemetry, enabled = true, children }: Props) {
  const [trace, setTrace] = useState<number[]>([]);
  const lastStamp = useRef<number | null>(null);

  const zone = liveTelemetry?.zones?.[zoneId];
  const tilt: number | null =
    typeof zone?.acoustic_tilt_db === "number"
      ? zone.acoustic_tilt_db
      : zoneId === "front" && typeof liveTelemetry?.acoustic_tilt_db === "number"
        ? liveTelemetry.acoustic_tilt_db
        : null;

  const target: string =
    zone?.acoustic_target ?? (zoneId === "front" ? liveTelemetry?.acoustic_target : undefined) ?? "None";
  const detected = enabled && target !== "None" && target !== "";

  useEffect(() => {
    const stamp = liveTelemetry?.systemTime ?? null;
    if (!enabled || tilt === null || stamp === null || stamp === lastStamp.current) return;
    lastStamp.current = stamp;
    setTrace((prev) => [...prev, tilt].slice(-TRACE_POINTS));
  }, [liveTelemetry, tilt, enabled]);

  const pct = (v: number) => Math.max(0, Math.min(100, ((v - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100));

  const W = 280;
  const H = 30;
  const points =
    trace.length > 1
      ? trace
          .map((v, i) => {
            const x = (i / (trace.length - 1)) * W;
            const y = H - 2 - (pct(v) / 100) * (H - 4);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ")
      : "";

  return (
    <div
      className={`bg-slate-900 border rounded-lg p-4 font-mono text-xs flex flex-col ${
        detected ? "border-red-900/60" : "border-slate-800"
      } ${!enabled ? "opacity-60" : ""}`}
    >
      {/* header */}
      <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              !enabled ? "bg-slate-700" : detected ? "bg-red-500 animate-ping" : "bg-emerald-500 animate-pulse"
            }`}
          />
          <h3 className="font-bold tracking-wider uppercase text-slate-300 truncate">{label}</h3>
        </div>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider font-bold shrink-0 ${
            !enabled
              ? "bg-slate-950 border-slate-800 text-slate-600"
              : detected
                ? "bg-red-950/40 border-red-900/50 text-red-400"
                : "bg-emerald-950/30 border-emerald-900/40 text-emerald-500"
          }`}
        >
          {!enabled ? "Offline" : detected ? "Contact" : "Clear"}
        </span>
      </div>

      {/* camera */}
      <div className="aspect-video bg-slate-950 rounded border border-slate-850 overflow-hidden mb-3 relative">
        {enabled && children ? (
          children
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1">
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">No camera installed</span>
            <span className="text-[9px] text-slate-700">Awaiting UVC hardware</span>
          </div>
        )}
      </div>

      {/* acoustic */}
      <div className="mt-auto">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Acoustic tilt</span>
          {enabled && tilt !== null ? (
            <span className={`text-base font-bold tabular-nums ${detected ? "text-red-400" : "text-slate-200"}`}>
              {tilt.toFixed(1)}
              <span className="text-slate-500 text-[10px] ml-0.5">dB</span>
            </span>
          ) : (
            <span className="text-slate-700 text-[10px]">no array</span>
          )}
        </div>

        {enabled && tilt !== null ? (
          <>
            <div className="relative w-full h-3 bg-slate-950 rounded border border-slate-800 overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 transition-all duration-500 ${
                  detected ? "bg-red-600/70" : "bg-emerald-600/50"
                }`}
                style={{ width: `${pct(tilt)}%` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-amber-400"
                style={{ left: `${pct(THRESHOLD_DB)}%` }}
                title={`threshold ${THRESHOLD_DB} dB`}
              />
            </div>

            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-1.5">
              <line
                x1="0"
                y1={H - 2 - (pct(THRESHOLD_DB) / 100) * (H - 4)}
                x2={W}
                y2={H - 2 - (pct(THRESHOLD_DB) / 100) * (H - 4)}
                stroke="#f59e0b"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.6"
              />
              {points && (
                <polyline
                  fill="none"
                  stroke={detected ? "#ef4444" : "#10b981"}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  points={points}
                />
              )}
            </svg>

            <p className="text-[9px] text-slate-600 mt-1">2–12 kHz vs 100–600 Hz · threshold {THRESHOLD_DB} dB</p>
          </>
        ) : (
          <div className="h-3 bg-slate-950 rounded border border-slate-850" />
        )}
      </div>
    </div>
  );
}
