// src/app/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import PowerMetricsPanel from "./dashboard/PowerMetricsPanel";
import RpiHealthMetricsPanel, { RpiMetricEntry } from "./dashboard/RpiHealthMetricsPanel";
// Import your fresh real-time WebRTC media component
import WebRtcCameraFeed from "./dashboard/WebRtcCameraFeed";

interface LogEntry {
  id: string;
  sensor: string;
  status: string;
  timestamp: number;
  notes?: string;
  zone: string;
  thumbnail?: string; // NEW: base64 image from the Pi (optional)
  datetime?: string; // NEW: readable timestamp (optional)
  image_local?: string; // NEW: full-res filename on the Pi (optional)
}

export default function LannessDashboard() {
  const [globalSystemStatus, setGlobalSystemStatus] = useState<string>("standby");
  const [liveTelemetry, setLiveTelemetry] = useState<any>(null);
  const [historyLogs, setHistoryLogs] = useState<LogEntry[]>([]);
  const [rpiMetricsHistory, setRpiMetricsHistory] = useState<RpiMetricEntry[]>([]);
  const [cameraDirection, setCameraDirection] = useState<"N" | "S" | "E" | "W">("N");
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [showCurrentThreat, setShowCurrentThreat] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const [logToDelete, setLogToDelete] = useState<string | null>(null);
  const [threatNote, setThreatNote] = useState<string>("");
  const [activeIncident, setActiveIncident] = useState<any>(null);
  const threatActive = !!activeIncident;
  const [notesText, setNotesText] = useState("");
  const [savingAck, setSavingAck] = useState(false);

  // NEW: pull thumbnails from the most recent real breaches (max 2)
  const threatSnapshots = historyLogs
    .filter((log) => log.thumbnail)
    .slice(0, 2)
    .map((log) => log.thumbnail as string);

  // STREAM A: Real-Time Telemetry Listener
  useEffect(() => {
    const telemetryUrl = "https://lanness-sytem-default-rtdb.firebaseio.com/lanness-tower-01/telemetry.json";
    const eventSource = new EventSource(telemetryUrl);

    eventSource.addEventListener("put", (event: MessageEvent) => {
      try {
        const streamData = JSON.parse(event.data);
        if (!streamData) return;

        if (streamData.path === "/" && streamData.data) {
          setGlobalSystemStatus(streamData.data.status || "standby");
          setLiveTelemetry(streamData.data.metrics || null);
        } else if (streamData.path === "/metrics") {
          setLiveTelemetry(streamData.data);
        } else if (streamData.path === "/status") {
          setGlobalSystemStatus(streamData.data);
        }
      } catch (error) {
        console.error("Telemetry streaming error:", error);
      }
    });

    return () => eventSource.close();
  }, []);

  // STREAM B: Trigger History Logs Listener
  useEffect(() => {
    const historyUrl = "https://lanness-sytem-default-rtdb.firebaseio.com/lanness-tower-01/history.json";
    const eventSource = new EventSource(historyUrl);

    eventSource.addEventListener("put", (event: MessageEvent) => {
      try {
        const streamData = JSON.parse(event.data);
        if (!streamData) return;

        const rawData = streamData.data;

        if (streamData.path === "/") {
          // Full tree refresh
          if (rawData) {
            const parsedLogs = Object.keys(rawData).map((key) => ({
              id: key,
              ...rawData[key],
            }));
            setHistoryLogs(parsedLogs.sort((a, b) => b.timestamp - a.timestamp));
          } else {
            setHistoryLogs([]);
          }
        } else if (streamData.path) {
          const itemId = streamData.path.replace("/", "");

          if (rawData === null) {
            // NEW: a record was DELETED -> remove it from local state live
            setHistoryLogs((prev) => prev.filter((item) => item.id !== itemId));
          } else {
            // A record was added/updated
            const newLog = { id: itemId, ...rawData };
            setHistoryLogs((prev) => {
              const without = prev.filter((item) => item.id !== itemId);
              return [newLog, ...without].sort((a, b) => b.timestamp - a.timestamp);
            });
          }
        }
      } catch (error) {
        console.error("History logging stream error:", error);
      }
    });

    return () => eventSource.close();
  }, []);

  // STREAM C: RPi 5 Health Monitor
  useEffect(() => {
    const rpiUrl = "https://lanness-sytem-default-rtdb.firebaseio.com/expanded_metrics.json";
    const eventSource = new EventSource(rpiUrl);

    eventSource.addEventListener("put", (event: MessageEvent) => {
      try {
        const streamData = JSON.parse(event.data);
        if (!streamData) return;

        const rawData = streamData.data;

        if (streamData.path === "/") {
          if (rawData) {
            const parsedMetrics = Object.keys(rawData).map((key) => ({
              id: key,
              ...rawData[key],
            }));
            setRpiMetricsHistory(
              parsedMetrics.sort((a, b) => b.system_identity.timestamp - a.system_identity.timestamp),
            );
          } else {
            setRpiMetricsHistory([]);
          }
        } else if (streamData.path && streamData.data) {
          const newId = streamData.path.replace("/", "");
          const newEntry = { id: newId, ...streamData.data };

          setRpiMetricsHistory((prev) => {
            if (prev.some((item) => item.id === newId)) return prev;
            const combined = [newEntry, ...prev];
            return combined.sort((a, b) => b.system_identity.timestamp - a.system_identity.timestamp).slice(0, 40);
          });
        }
      } catch (error) {
        console.error("Expanded metrics telemetry streaming error:", error);
      }
    });

    return () => eventSource.close();
  }, []);

  // STREAM D: Active Incident Listener (latched alert state)
  useEffect(() => {
    let mounted = true;
    const pull = async () => {
      try {
        const res = await fetch("https://lanness-sytem-default-rtdb.firebaseio.com/lanness-tower-01/incident.json");
        const data = await res.json();
        if (mounted) setActiveIncident(data && data.active ? data : null);
      } catch (e) {
        console.error("Incident pull failed:", e);
      }
    };
    pull();
    const id = setInterval(pull, 3000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const initiateDeleteLog = (id: string) => {
    setLogToDelete(id);
  };

  const confirmDeleteLog = async () => {
    if (!logToDelete) return;
    try {
      const itemUrl = `https://lanness-sytem-default-rtdb.firebaseio.com/lanness-tower-01/history/${logToDelete}.json`;
      const response = await fetch(itemUrl, { method: "DELETE" });
      if (!response.ok) console.error("Failed to delete specific item node from backend database.");
    } catch (error) {
      console.error("Network fault processing item node elimination:", error);
    } finally {
      setLogToDelete(null);
    }
  };

  const acknowledgeIncident = async () => {
    if (!activeIncident) return;
    setSavingAck(true);
    const base = "https://lanness-sytem-default-rtdb.firebaseio.com/lanness-tower-01";
    try {
      // Save notes + acknowledged onto the specific breach record
      if (activeIncident.event_id) {
        await fetch(`${base}/history/${activeIncident.event_id}.json`, {
          method: "PATCH",
          body: JSON.stringify({
            notes: notesText || "",
            acknowledged: true,
            acknowledged_at: Math.floor(Date.now() / 1000),
          }),
        });
      }
      // Clear the incident so ALL monitors return to secure
      await fetch(`${base}/incident.json`, {
        method: "PATCH",
        body: JSON.stringify({ active: false }),
      });
      // update the on-screen history list so the note shows immediately
      setHistoryLogs((prev) =>
        prev.map((log) =>
          log.id === activeIncident.event_id ? { ...log, notes: notesText, acknowledged: true } : log,
        ),
      );

      setActiveIncident(null);
      setNotesText("");
    } catch (e) {
      console.error("Acknowledge failed:", e);
    } finally {
      setSavingAck(false);
    }
  };

  const handleDismissClick = () => setIsModalOpen(true);
  const confirmDismissal = () => {
    setShowCurrentThreat(false);
    setIsModalOpen(false);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 font-mono selection:bg-emerald-500/20">
      {/* Header Panel */}
      <header className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-wider text-emerald-500">Lannes System Dashboard</h1>
          <p className="text-[11px] text-slate-400">Tactical Perimeter Security Hub</p>
        </div>
        <div className="bg-slate-900 px-4 py-1.5 rounded border border-slate-800 flex items-center gap-3 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${globalSystemStatus !== "Idle" ? "bg-red-500 animate-pulse" : "bg-emerald-500 animate-ping"}`}
          ></span>
          <span className="text-slate-300 uppercase tracking-wide">Tower Status: {globalSystemStatus}</span>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto flex flex-col">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Column A: Camera Matrix Frame */}
          <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Tower Camera Array</h2>
              <span className="text-[10px] bg-slate-950 px-2 py-0.5 rounded text-emerald-400">Arducam IMX477</span>
            </div>

            {/* CLEAN OVERHAUL: Swapped simulation text directly for your real WebRTC player engine */}
            <div className="relative aspect-video bg-slate-950 rounded border border-slate-850 overflow-hidden">
              <WebRtcCameraFeed currentDirection={cameraDirection} />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(["N", "S", "E", "W"] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => setCameraDirection(dir)}
                  className={`py-2 text-xs font-bold rounded border transition-colors ${
                    cameraDirection === dir
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  Direction {dir}
                </button>
              ))}
            </div>
          </div>

          {/* Column B: Telemetry Threats and Real-time Trigger History */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col justify-between h-full w-full">
            <div>
              <div className="flex border-b border-slate-800 mb-4 text-xs font-bold">
                <button
                  onClick={() => setActiveTab("current")}
                  className={`flex-1 pb-2 uppercase tracking-wider transition-colors ${activeTab === "current" ? "border-b-2 border-emerald-500 text-emerald-400" : "text-slate-500"}`}
                >
                  Current Threat
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`flex-1 pb-2 uppercase tracking-wider transition-colors ${activeTab === "history" ? "border-b-2 border-emerald-500 text-emerald-400" : "text-slate-500"}`}
                >
                  Trigger History
                </button>
              </div>

              {/* Display Area */}
              <div className="space-y-3 w-full">
                {activeTab === "current" ? (
                  liveTelemetry ? (
                    <div
                      className={`p-4 rounded text-xs space-y-3 border ${
                        threatActive ? "bg-red-950/10 border-red-900/40" : "bg-emerald-950/10 border-emerald-900/30"
                      }`}
                    >
                      {threatActive ? (
                        <div className="flex justify-between items-center text-red-400 font-bold">
                          <span>⚠️ ACTIVE INCIDENT</span>
                          <span className="text-[10px] bg-red-950 border border-red-800 px-1.5 py-0.5 rounded animate-pulse">
                            LIVE
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center text-emerald-400 font-bold">
                          <span>✓ PERIMETER SECURE</span>
                          <span className="text-[10px] bg-emerald-950 border border-emerald-800 px-1.5 py-0.5 rounded">
                            MONITORING
                          </span>
                        </div>
                      )}

                      <div className="space-y-1 text-slate-300 pt-1">
                        <p>
                          <span className="text-slate-500">Acoustic Profile:</span>{" "}
                          <span className="text-amber-400 font-bold">{liveTelemetry.acoustic_target || "None"}</span> (
                          {liveTelemetry.acoustic_frequency_hz || 0} Hz)
                        </p>
                        <p>
                          <span className="text-slate-500">LiDAR Range Boundary:</span>{" "}
                          {liveTelemetry.lidar_distance_m || 0} meters
                        </p>
                        <p>
                          <span className="text-slate-500">PIR Sensor Breach:</span>{" "}
                          {threatActive ? "CORRIDOR VIOLATION" : "SECURE"}
                        </p>
                      </div>

                      <div className="space-y-2 pt-1 border-t border-red-900/30">
                        <span className="text-[10px] text-slate-500 uppercase block tracking-wider font-bold">
                          Arducam Threat Capture Event
                        </span>
                        <div className="flex gap-2">
                          {threatSnapshots.map((src, idx) => (
                            <div
                              key={idx}
                              onClick={() => setExpandedImage(src)}
                              className="relative w-24 aspect-video bg-slate-950 rounded border border-slate-800 overflow-hidden cursor-zoom-in hover:border-red-500 transition-colors group flex-shrink-0"
                            >
                              <img
                                src={src}
                                alt={`Threat Capture Frame ${idx + 1}`}
                                className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                              />
                              <div className="absolute bottom-0.5 right-1 bg-slate-950/80 px-1 rounded text-[7px] text-slate-400 font-mono">
                                F_0{idx + 1}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="pt-1">
                          <label className="text-[10px] text-slate-500 uppercase block tracking-wider font-bold mb-1">
                            Incident Tactical Notes
                          </label>
                          <textarea
                            value={notesText}
                            onChange={(e) => setNotesText(e.target.value)}
                            placeholder="Type tactical assessment log details here..."
                            className="w-full bg-slate-950/60 border border-slate-800 rounded p-2 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-red-900/60 resize-none h-14 font-mono"
                          />
                          {threatActive && (
                            <button
                              onClick={acknowledgeIncident}
                              disabled={savingAck}
                              className="w-full mt-2 py-2 text-xs font-bold rounded border bg-emerald-700 border-emerald-600 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 uppercase tracking-wide"
                            >
                              {savingAck ? "Saving..." : "Acknowledge & Clear Incident"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16 text-xs text-slate-500 italic">No active vectors reported.</div>
                  )
                ) : (
                  <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                    {historyLogs.length > 0 ? (
                      historyLogs.map((log) => (
                        <div
                          key={log.id}
                          className="bg-slate-950 p-2.5 rounded border border-slate-850 text-[11px] space-y-1 relative group/card"
                        >
                          <div className="flex justify-between items-center text-slate-500 text-[10px]">
                            <span>{new Date(log.timestamp * 1000).toLocaleString()}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-emerald-500 font-bold">{log.zone}</span>
                              <button
                                onClick={() => initiateDeleteLog(log.id)}
                                className="text-red-500 hover:text-red-400 font-bold transition-colors pl-1 text-[10px]"
                                title="Purge Record"
                              >
                                [X]
                              </button>
                            </div>
                          </div>

                          {/* NEW: real captured thumbnail (only if present) */}
                          {log.thumbnail && (
                            <div
                              onClick={() => setExpandedImage(log.thumbnail!)}
                              className="relative w-full h-[200px] aspect-video bg-slate-900 rounded border border-slate-800 overflow-hidden cursor-zoom-in hover:border-red-500 transition-colors my-1.5"
                            >
                              <img
                                src={log.thumbnail}
                                alt={`Breach ${log.id}`}
                                className="w-full h-full object-cover opacity-80 hover:opacity-100 transition-opacity"
                              />
                              <div className="absolute bottom-0.5 right-1 bg-slate-950/80 px-1 rounded text-[7px] text-slate-400 font-mono">
                                IR_CAPTURE
                              </div>
                            </div>
                          )}

                          <p className="text-slate-200 font-semibold">{log.sensor}</p>
                          <p className="text-slate-400 text-[10px]">↳ Status: {log.status}</p>

                          {log.notes && (
                            <div className="mt-1.5 pt-1.5 border-t border-slate-800/60">
                              <span className="text-[9px] text-slate-600 uppercase tracking-wider font-bold block mb-0.5">
                                Tactical Assessment
                              </span>
                              <p className="text-[10px] text-slate-300 italic leading-snug">“{log.notes}”</p>
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-16 text-xs text-slate-500 italic">
                        Trigger history index log empty.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Column C: Power Subsystem Section */}
        <PowerMetricsPanel liveMetrics={liveTelemetry} />

        {/* Integrated directly under the Power Subsystem Monitor */}
        <RpiHealthMetricsPanel metricsHistory={rpiMetricsHistory} />
      </div>

      {/* Itemized Log History Deletion Level-2 Approval Modal */}
      {logToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-xs font-bold uppercase text-amber-500 tracking-wider mb-2">
              ⚠️ Priority Level-2 Action
            </h3>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-6">
              Executing administrative override. This will permanently purge this specific event log record from the
              remote index database cache.
            </p>
            <div className="flex gap-2 justify-end text-xs">
              <button
                onClick={() => setLogToDelete(null)}
                className="bg-slate-950 text-slate-400 px-4 py-2 rounded border border-slate-800"
              >
                Cancel
              </button>
              <button onClick={confirmDeleteLog} className="bg-red-600 font-bold px-4 py-2 rounded text-white">
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Intercept Lightbox Modal for Threat Snapshots */}
      {expandedImage && (
        <div
          className="fixed inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4 cursor-zoom-out"
          onClick={() => setExpandedImage(null)}
        >
          <div className="relative max-w-4xl w-full aspect-video bg-slate-950 border border-slate-800 rounded-lg overflow-hidden shadow-2xl shadow-red-950/20">
            <img src={expandedImage} alt="Expanded Threat Snapshot View" className="w-full h-full object-contain" />
            <div className="absolute top-4 left-4 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded text-[10px] tracking-wider text-slate-400 font-mono space-y-0.5">
              <p className="text-red-400 font-bold">// PERIMETER BREACH ENHANCEMENT</p>
              <p>SOURCE: TOWER_01_CAM_MATRIX</p>
              <p>RESOLUTION: 4056x3040 HQ</p>
            </div>
            <button
              className="absolute top-4 right-4 bg-slate-950/80 hover:bg-slate-900 border border-slate-800 text-slate-300 text-[10px] uppercase font-bold px-3 py-1.5 rounded transition-colors"
              onClick={() => setExpandedImage(null)}
            >
              Close View [ESC]
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
