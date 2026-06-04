// src/app/RpiHealthMetricsPanel.tsx
"use client";

import React, { useState } from "react";

export interface RpiMetricEntry {
  id: string;
  network_performance: { transmission_latency_ms: number };
  processing_core: {
    clock_speed_mhz: number;
    ram_free_bytes: number;
    ram_total_bytes: number;
    ram_usage_percent: number;
    ram_used_bytes: number;
  };
  system_identity: {
    kernel_version: string;
    timestamp: number;
    uptime_hours: number;
  };
  thermal_and_power: {
    cpu_temperature_celsius: number;
    fan_target_state: number;
    pmic_voltages: string;
  };
  throttling_flags: {
    frequency_capped_has_occurred: boolean;
    frequency_capped_now: boolean;
    temperature_limit_has_occurred: boolean;
    temperature_limit_now: boolean;
    throttled_has_occurred: boolean;
    throttled_now: boolean;
    under_voltage_has_occurred: boolean;
    under_voltage_now: boolean;
  };
}

interface Props {
  metricsHistory: RpiMetricEntry[];
}

function TelemetrySparkline({ data, color = "#10b981" }: { data: number[]; color?: string }) {
  // If we only have 1 data point, generate a steady placeholder base line to avoid empty flashes
  const graphPoints = data.length === 1 ? [data[0], data[0]] : data;

  const width = 160;
  const height = 28;
  const min = Math.min(...graphPoints);
  const max = Math.max(...graphPoints);
  const range = max - min === 0 ? 1 : max - min;

  const points = graphPoints
    .map((val, idx) => {
      const x = (idx / (graphPoints.length - 1)) * width;
      const y = height - 3 - ((val - min) / range) * (height - 6);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="bg-slate-950/70 px-1.5 py-0.5 rounded border border-slate-900 flex items-center shadow-inner">
      <svg width={width} height={height} className="overflow-visible">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}

export default function RpiHealthMetricsPanel({ metricsHistory }: Props) {
  const [showRawPmic, setShowRawPmic] = useState(false);
  const activeEntry = metricsHistory[0];

  if (!activeEntry) {
    return (
      <div className="mt-6 bg-slate-900 border border-slate-800 rounded-lg p-6 text-center text-xs font-mono text-slate-500 tracking-widest animate-pulse">
        ⚡ ESTABLISHING EXPANDED FIREBASE TELEMETRY CHANNEL LINK...
      </div>
    );
  }

  // REFACTOR: Reverses the descending array structure to timeline order for standard left-to-right graphs
  const recentHistory = [...metricsHistory].reverse();
  const tempTrend = recentHistory.map((h) => h.thermal_and_power.cpu_temperature_celsius);
  const ramTrend = recentHistory.map((h) => h.processing_core.ram_usage_percent);
  const speedTrend = recentHistory.map((h) => h.processing_core.clock_speed_mhz);

  const getPmicValue = (targetKey: string): string => {
    if (!activeEntry.thermal_and_power.pmic_voltages) return "0.00V";
    const lines = activeEntry.thermal_and_power.pmic_voltages.split("\n");
    const matchedLine = lines.find((line) => line.includes(targetKey));
    if (!matchedLine) return "N/A";
    const cleanValue = matchedLine.split("=")[1];
    return cleanValue ? cleanValue.trim() : "N/A";
  };

  return (
    <div className="mt-6 bg-slate-900 border border-slate-800 rounded-lg p-5 font-mono text-xs space-y-5">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping"></span>
          <h3 className="font-bold tracking-wider uppercase text-slate-300">Raspberry Pi 5 Subsystem Health Node</h3>
        </div>
        <div className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
          OS KERNEL: <span className="text-cyan-400 font-semibold">{activeEntry.system_identity.kernel_version}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Temperature */}
        <div className="bg-slate-950/40 border border-slate-850 p-3 rounded flex flex-col justify-between space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-[10px] uppercase font-bold">CPU Core Thermal</span>
            <span className="text-amber-500 font-bold text-sm">
              {activeEntry.thermal_and_power.cpu_temperature_celsius.toFixed(1)}°C
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 pt-1">
            <span className="text-[9px] text-slate-600">
              Fan: State {activeEntry.thermal_and_power.fan_target_state}
            </span>
            <TelemetrySparkline data={tempTrend} color="#f59e0b" />
          </div>
        </div>

        {/* Metric 2: Memory Footprint */}
        <div className="bg-slate-950/40 border border-slate-850 p-3 rounded flex flex-col justify-between space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-[10px] uppercase font-bold">RAM Allocation</span>
            <span className="text-emerald-400 font-bold text-sm">
              {activeEntry.processing_core.ram_usage_percent.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 pt-1">
            <span className="text-[9px] text-slate-600">
              {(activeEntry.processing_core.ram_used_bytes / 1024 / 1024).toFixed(0)}M Used
            </span>
            <TelemetrySparkline data={ramTrend} color="#10b981" />
          </div>
        </div>

        {/* Metric 3: Processing Clock */}
        <div className="bg-slate-950/40 border border-slate-850 p-3 rounded flex flex-col justify-between space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-slate-500 text-[10px] uppercase font-bold">Core CPU Speed</span>
            <span className="text-cyan-400 font-bold text-sm">{activeEntry.processing_core.clock_speed_mhz} MHz</span>
          </div>
          <div className="flex items-center justify-between gap-1 pt-1">
            <span className="text-[9px] text-slate-600">Uptime: {activeEntry.system_identity.uptime_hours} hrs</span>
            <TelemetrySparkline data={speedTrend} color="#06b6d4" />
          </div>
        </div>

        {/* Metric 4: Communication Latency */}
        <div className="bg-slate-950/40 border border-slate-850 p-3 rounded flex flex-col justify-between space-y-1">
          <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">Network Latency</span>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">Firebase Feed Round-trip:</span>
              <span className="text-emerald-400 font-bold">
                {activeEntry.network_performance.transmission_latency_ms} ms
              </span>
            </div>
            <div className="w-full bg-slate-950 h-1.5 rounded overflow-hidden p-0.5 border border-slate-900">
              <div
                className="bg-emerald-500 h-full rounded-sm transition-all duration-300"
                style={{
                  width: `${Math.min(Math.max(activeEntry.network_performance.transmission_latency_ms || 5, 10), 100)}%`,
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-950 border border-slate-850 rounded p-3 space-y-3">
          <div className="flex justify-between items-center border-b border-slate-900 pb-2">
            <span className="text-slate-400 font-bold uppercase text-[10px]">
              DA9091 PMIC Key Voltage & Current Rails
            </span>
            <button
              onClick={() => setShowRawPmic(!showRawPmic)}
              className="text-[9px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-cyan-400 transition-colors font-bold"
            >
              {showRawPmic ? "[ View Parsed Grid ]" : "[ Dump Raw String Stream ]"}
            </button>
          </div>

          {showRawPmic ? (
            <pre className="text-[10px] text-slate-400 leading-tight overflow-x-auto whitespace-pre p-2 bg-slate-950 rounded max-h-36 border border-slate-900 font-mono scrollbar-thin">
              {activeEntry.thermal_and_power.pmic_voltages}
            </pre>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px]">
              <div className="bg-slate-900/50 p-2 rounded border border-slate-900 flex justify-between">
                <span className="text-slate-500">VDD_CORE_V</span>
                <span className="text-slate-300 font-bold">{getPmicValue("VDD_CORE_V")}</span>
              </div>
              <div className="bg-slate-900/50 p-2 rounded border border-slate-900 flex justify-between">
                <span className="text-slate-500">3V3_SYS_V</span>
                <span className="text-slate-300 font-bold">{getPmicValue("3V3_SYS_V")}</span>
              </div>
              <div className="bg-slate-900/50 p-2 rounded border border-slate-900 flex justify-between">
                <span className="text-slate-500">1V8_SYS_V</span>
                <span className="text-slate-300 font-bold">{getPmicValue("1V8_SYS_V")}</span>
              </div>
              <div className="bg-slate-900/50 p-2 rounded border border-slate-900 flex justify-between">
                <span className="text-slate-500">HDMI_V</span>
                <span className="text-slate-300 font-bold">{getPmicValue("HDMI_V")}</span>
              </div>
              <div className="bg-slate-900/50 p-2 rounded border border-slate-900 flex justify-between">
                <span className="text-slate-500">EXT5V_V</span>
                <span className="text-slate-300 font-bold">{getPmicValue("EXT5V_V")}</span>
              </div>
              <div className="bg-slate-900/50 p-2 rounded border border-slate-900 flex justify-between">
                <span className="text-slate-500">VDD_CORE_A</span>
                <span className="text-amber-500 font-bold">{getPmicValue("VDD_CORE_A")}</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-slate-950 border border-slate-850 rounded p-3 space-y-2">
          <span className="text-slate-400 font-bold uppercase text-[10px] block border-b border-slate-900 pb-2">
            Firmware Throttling Intercepts
          </span>

          <div className="space-y-1.5 text-[10px] uppercase">
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500">Under Voltage Status</span>
              <span
                className={`px-1.5 py-0.5 rounded font-bold ${activeEntry.throttling_flags.under_voltage_now ? "bg-red-950 text-red-500 border border-red-900" : "bg-emerald-950/40 text-emerald-500"}`}
              >
                {activeEntry.throttling_flags.under_voltage_now ? "⚠️ ACTIVE CRITICAL" : "OK"}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500">Thermal Cap Limit</span>
              <span
                className={`px-1.5 py-0.5 rounded font-bold ${activeEntry.throttling_flags.temperature_limit_now ? "bg-red-950 text-red-500 border border-red-900" : "bg-emerald-950/40 text-emerald-500"}`}
              >
                {activeEntry.throttling_flags.temperature_limit_now ? "⚠️ CAPPED" : "OK"}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5">
              <span className="text-slate-500">Core Throttling Flag</span>
              <span
                className={`px-1.5 py-0.5 rounded font-bold ${activeEntry.throttling_flags.throttled_now ? "bg-red-950 text-red-500 border border-red-900" : "bg-emerald-950/40 text-emerald-500"}`}
              >
                {activeEntry.throttling_flags.throttled_now ? "⚠️ ACTIVE" : "OK"}
              </span>
            </div>
            <div className="flex justify-between items-center py-0.5 text-[9px] text-slate-600 lowercase italic border-t border-slate-900 pt-1.5">
              <span>Historical anomalies logged:</span>
              <span>
                {activeEntry.throttling_flags.under_voltage_has_occurred ||
                activeEntry.throttling_flags.throttled_has_occurred
                  ? "Yes (Check Logs)"
                  : "None"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
