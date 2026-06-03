// src/app/PowerMetricsPanel.tsx
"use client";

import React, { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Battery, Activity, Zap } from "lucide-react";

// ... interface definitions stay exactly the same ...

export default function PowerMetricsPanel({ liveMetrics }: { liveMetrics: any }) {
  const [chartData, setChartData] = useState<any[]>([]);

  //   # 1. Fortified Property Safety Extraction
  //   # If liveMetrics or its internal properties don't exist, it uses safe default fallbacks safely
  const battery_voltage_v = liveMetrics?.battery_voltage_v ?? 12.0;
  const current_draw_a = liveMetrics?.current_draw_a ?? 0.0;
  const max_capacity_ah = liveMetrics?.max_capacity_ah ?? 50.0;
  const remaining_capacity_ah = liveMetrics?.remaining_capacity_ah ?? 25.0;
  const charge_percentage = liveMetrics?.charge_percentage ?? 50;

  useEffect(() => {
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setChartData((prev) => {
      const updated = [...prev, { time: now, amps: current_draw_a }];
      return updated.slice(-15);
    });
  }, [current_draw_a]);

  //   # 2. Safe Calculation Processing
  const powerWatts = (battery_voltage_v * current_draw_a).toFixed(1);

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-5 font-mono text-xs text-slate-300 w-full mt-6">
      <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-500" />
          <h2 className="font-bold tracking-wider text-slate-400 uppercase">Power Subsystem Monitor</h2>
        </div>
        <span className="text-[10px] bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-emerald-400">
          12V DC Primary Rail
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-950 p-3 rounded border border-slate-850">
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider mb-1">Bus Voltage</span>
              {/* Using the safe local variables now */}
              <span className="text-xl font-bold text-slate-100">
                {battery_voltage_v.toFixed(1)} <span className="text-xs text-slate-400">V</span>
              </span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-850">
              <span className="text-slate-500 block text-[10px] uppercase tracking-wider mb-1">Amperage Draw</span>
              <span className="text-xl font-bold text-slate-100">
                {current_draw_a.toFixed(2)} <span className="text-xs text-slate-400">A</span>
              </span>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-850 space-y-2">
            <div className="flex justify-between items-center text-[10px]">
              <div className="flex items-center gap-1.5 text-slate-400 uppercase font-bold">
                <Battery className="w-3.5 h-3.5 text-emerald-500" />
                <span>Battery Level</span>
              </div>
              <span className="text-slate-200 font-bold">{charge_percentage}%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${charge_percentage}%` }}
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-slate-950 p-3 rounded border border-slate-850 flex flex-col justify-between h-[150px]">
          <div className="flex justify-between items-center text-[10px] mb-2 text-slate-500 uppercase tracking-wider">
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-500" />
              <span>Current Load Profile History</span>
            </div>
            <span>Calculated Output: {powerWatts} W</span>
          </div>

          <div className="w-full h-full min-h-[100px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAmps" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <YAxis tick={{ fill: "#475569", fontSize: 9 }} domain={[0, "auto"]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#334155",
                    borderRadius: "4px",
                    fontFamily: "monospace",
                    fontSize: "10px",
                  }}
                  itemStyle={{ color: "#10b981" }}
                />
                <Area
                  type="monotone"
                  dataKey="amps"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  fillOpacity={1}
                  fill="url(#colorAmps)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
