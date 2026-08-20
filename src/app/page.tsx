// src/app/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import PowerMetricsPanel from "./dashboard/PowerMetricsPanel";
import RpiHealthMetricsPanel, { RpiMetricEntry } from "./dashboard/RpiHealthMetricsPanel";
// Import your fresh real-time WebRTC media component
import WebRtcCameraFeed from "./dashboard/WebRtcCameraFeed";
import StreamControlPanel from "./dashboard/StreamControlPanel";
import ZonePanel from "./dashboard/ZonePanel";

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
  const [activeTab, setActiveTab] = useState<"current" | "history">("current");
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  const [logToDelete, setLogToDelete] = useState<string | null>(null);
  const [activeIncident, setActiveIncident] = useState<any>(null);
  const threatActive = !!activeIncident;
  const [notesText, setNotesText] = useState("");
  const [savingAck, setSavingAck] = useState(false);
  const [captureGallery, setCaptureGallery] = useState<any[] | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [sirenSounding, setSirenSounding] = useState(false);
  const [sirenCountdown, setSirenCountdown] = useState(0);

  // NEW: pull thumbnails from the most recent real breaches (max 2)
  // Source the capture from the ACTIVE INCIDENT, not recent history — that
  // way it clears automatically on acknowledge instead of showing stale shots.

  // Captures accumulate on the open incident and clear on acknowledge.
  const threatSnapshots: any[] = activeIncident?.captures
    ? Object.keys(activeIncident.captures)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => activeIncident.captures[k])
    : [];

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

  // STREAM D: Active Incident Listener (EventSource - near-instant)
  useEffect(() => {
    const incidentUrl = "https://lanness-sytem-default-rtdb.firebaseio.com/lanness-tower-01/incident.json";
    const eventSource = new EventSource(incidentUrl);

    const handle = (event: MessageEvent) => {
      try {
        const streamData = JSON.parse(event.data);
        if (!streamData) {
          setActiveIncident(null);
          return;
        }
        // Firebase sends the full incident object (or a sub-field) on change.
        // When path is "/", data is the whole incident node.
        if (streamData.path === "/") {
          const data = streamData.data;
          setActiveIncident(data && data.active ? data : null);
        } else {
          // A sub-field changed (e.g. /active flipped). Re-fetch the whole node
          // to get a consistent object, since partial updates are fragmentary.
          fetch(incidentUrl)
            .then((r) => r.json())
            .then((data) => setActiveIncident(data && data.active ? data : null))
            .catch(() => {});
        }
      } catch (error) {
        console.error("Incident stream error:", error);
      }
    };

    eventSource.addEventListener("put", handle);
    eventSource.addEventListener("patch", handle);

    return () => eventSource.close();
  }, []);

  const initiateDeleteLog = (id: string) => {
    setLogToDelete(id);
  };

  const clearAllHistory = async () => {
    if (!confirm(`Delete ALL ${historyLogs.length} history records? This cannot be undone.`)) return;
    setClearingAll(true);
    try {
      // One DELETE on the whole history node wipes every record at once
      await fetch("https://lanness-sytem-default-rtdb.firebaseio.com/lanness-tower-01/history.json", {
        method: "DELETE",
      });
      setHistoryLogs([]);
    } catch (e) {
      console.error("Clear all failed:", e);
    } finally {
      setClearingAll(false);
    }
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

  const soundAlarm = async () => {
    if (sirenSounding) return;
    setSirenSounding(true);
    setSirenCountdown(10);
    try {
      await fetch("https://lanness-sytem-default-rtdb.firebaseio.com/lanness-tower-01/siren_request.json", {
        method: "PUT",
        body: JSON.stringify({ active: true, started: Math.floor(Date.now() / 1000) }),
      });
    } catch (e) {
      console.error("Siren request failed:", e);
      setSirenSounding(false);
      return;
    }
    const iv = setInterval(() => {
      setSirenCountdown((n) => {
        if (n <= 1) {
          clearInterval(iv);
          setSirenSounding(false);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
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
            {/* CLEAN OVERHAUL: Swapped simulation text directly for your real WebRTC player engine */}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ZonePanel label="Front Mic&Cam_A" zoneId="front" liveTelemetry={liveTelemetry} enabled>
                <WebRtcCameraFeed currentDirection="Front" />
              </ZonePanel>

              <ZonePanel label="Rear Mic&Cam_B" zoneId="rear" liveTelemetry={liveTelemetry} enabled={false} />
            </div>
            <StreamControlPanel />
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
                          <span className="text-slate-500">Aerial Acoustic:</span>{" "}
                          <span
                            className={
                              liveTelemetry.acoustic_target && liveTelemetry.acoustic_target !== "None"
                                ? "text-red-400 font-bold"
                                : "text-emerald-400"
                            }
                          >
                            {liveTelemetry.acoustic_target && liveTelemetry.acoustic_target !== "None"
                              ? "DRONE DETECTED"
                              : "No aerial contact"}
                          </span>
                          {typeof liveTelemetry.acoustic_tilt_db === "number" && (
                            <span className="text-slate-600 text-[10px]">
                              {" "}
                              · tilt {liveTelemetry.acoustic_tilt_db.toFixed(1)} dB
                            </span>
                          )}
                        </p>
                        <p>
                          <span className="text-slate-500">Perimeter Sensor:</span>{" "}
                          <span className={threatActive ? "text-red-400 font-bold" : "text-emerald-400"}>
                            {threatActive ? "SENSOR TRIPPED" : "Not tripped"}
                          </span>
                        </p>
                        <p>
                          <span className="text-slate-500">Sensor Breach:</span>{" "}
                          {threatActive ? "CORRIDOR VIOLATION" : "SECURE"}
                        </p>
                      </div>

                      <div className="space-y-2 pt-1 border-t border-red-900/30">
                        <span className="text-[10px] text-slate-500 uppercase block tracking-wider font-bold">
                          Arducam Threat Capture Event
                        </span>
                        {activeIncident?.capture_count > 1 && (
                          <span className="text-[9px] bg-amber-950/50 border border-amber-800/60 text-amber-400 px-2 py-0.5 rounded uppercase tracking-wider font-bold animate-pulse">
                            ⚠ Acknowledgement required
                          </span>
                        )}
                      </div>

                      {(() => {
                        const caps = activeIncident?.captures
                          ? Object.keys(activeIncident.captures)
                              .sort((a, b) => Number(a) - Number(b))
                              .map((k) => activeIncident.captures[k])
                          : [];
                        if (!caps.length) {
                          return <p className="text-[10px] text-slate-600 italic">No capture for this incident.</p>;
                        }
                        const shown = caps.slice(0, 3);
                        const extra = caps.length - shown.length;
                        return (
                          <>
                            <div className="flex gap-2 items-center">
                              {shown.map((c: any, i: number) => (
                                <div
                                  key={i}
                                  onClick={() => setCaptureGallery(caps)}
                                  className="w-24 aspect-video bg-slate-900 rounded border border-red-900/40 overflow-hidden cursor-zoom-in hover:border-red-500 transition-colors relative"
                                >
                                  <img
                                    src={c.thumbnail}
                                    alt={`capture ${i + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  {i === 0 && caps.length > 1 && (
                                    <span className="absolute bottom-0 left-0 text-[8px] bg-black/70 text-slate-300 px-1">
                                      FIRST
                                    </span>
                                  )}
                                </div>
                              ))}
                              {extra > 0 && (
                                <button
                                  onClick={() => setCaptureGallery(caps)}
                                  className="w-14 h-14 rounded border border-slate-700 bg-slate-950 text-slate-300 text-sm font-bold hover:border-red-500 transition-colors"
                                >
                                  +{extra}
                                </button>
                              )}
                            </div>
                            <p className="text-[9px] text-slate-600">
                              {caps.length} trigger{caps.length !== 1 ? "s" : ""} since last acknowledge
                              {caps.length >= 8 ? " · capped at 8" : ""}
                            </p>
                          </>
                        );
                      })()}

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
                        <button
                          onClick={soundAlarm}
                          disabled={sirenSounding}
                          className="w-full mb-2 py-2 text-xs font-bold rounded border bg-red-700 border-red-600 text-white hover:bg-red-600 transition-colors disabled:opacity-60 uppercase tracking-wide"
                        >
                          {sirenSounding ? `Sounding · ${sirenCountdown}s` : "⚠ Sound Alarm"}
                        </button>
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
                  ) : (
                    <div className="text-center py-16 text-xs text-slate-500 italic">No active vectors reported.</div>
                  )
                ) : (
                  <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                    {historyLogs.length > 0 && (
                      <div className="flex justify-between items-center sticky top-0 bg-slate-900 z-10 pb-2 mb-1 border-b border-slate-800">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                          {historyLogs.length} Record{historyLogs.length !== 1 ? "s" : ""}
                        </span>
                        <button
                          onClick={clearAllHistory}
                          disabled={clearingAll}
                          className="text-[10px] bg-red-950/40 hover:bg-red-900/50 border border-red-900/50 text-red-400 px-2.5 py-1 rounded font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
                        >
                          {clearingAll ? "Clearing..." : "Clear All"}
                        </button>
                      </div>
                    )}
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
              <p>THUMBNAIL PREVIEW · FULL FRAME ON DEVICE (RESCALED)</p>
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
      {captureGallery && (
        <div
          onClick={() => setCaptureGallery(null)}
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8 cursor-zoom-out"
        >
          <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-slate-300 font-mono text-xs uppercase tracking-wider">
                {captureGallery.length} capture{captureGallery.length !== 1 ? "s" : ""} — unacknowledged incident
              </span>
              <button onClick={() => setCaptureGallery(null)} className="text-slate-500 hover:text-slate-200 text-xs">
                ✕ close
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[75vh] overflow-y-auto">
              {captureGallery.map((c: any, i: number) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded overflow-hidden">
                  <img src={c.thumbnail} alt={`capture ${i + 1}`} className="w-full aspect-video object-cover" />
                  <div className="p-2 font-mono text-[9px] text-slate-400">
                    <div className="text-slate-300">{c.sensor}</div>
                    <div>{new Date(c.timestamp * 1000).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
