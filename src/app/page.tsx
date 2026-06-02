// src/app/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';

interface TriggerLog {
  id: string;
  timestamp: string;
  sensor: string;
  zone: string;
  status: string;
}

export default function LannessDashboard() {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [cameraDirection, setCameraDirection] = useState<'N' | 'S' | 'E' | 'W'>('N');
  
  // App state for visibility toggles
  const [showCurrentThreat, setShowCurrentThreat] = useState(true);
  const [systemLogs, setSystemLogs] = useState<TriggerLog[]>([]);

  // Double approval modal tracking states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [targetToDismiss, setTargetToDismiss] = useState<'current' | string | null>(null);

  // Initialize mock Firestore streams
  useEffect(() => {
    const mockData: TriggerLog[] = [
      { id: '1', timestamp: '2026-05-29 10:31:02', sensor: 'LiDAR TF03-100', zone: 'North Vector', status: 'Beam Cleared' },
      { id: '2', timestamp: '2026-05-29 10:32:15', sensor: 'MEMS Mic Cluster (x8)', zone: 'East Vector', status: 'Acoustic Match: Drone' },
      { id: '3', timestamp: '2026-05-29 10:34:40', sensor: 'HC-SR501 PIR', zone: 'South Vector', status: 'Active Warning Dispatched' },
    ];
    setSystemLogs(mockData);
  }, []);

  // Phase 1: Trigger the Approval Process
  const initiateDismissal = (target: 'current' | string) => {
    setTargetToDismiss(target);
    setIsModalOpen(true);
  };

  // Phase 2: Finalized Second Approval Execution
  const confirmDismissal = () => {
    if (targetToDismiss === 'current') {
      setShowCurrentThreat(false);
    } else if (typeof targetToDismiss === 'string') {
      setSystemLogs(prev => prev.filter(log => log.id !== targetToDismiss));
    }
    // Clean up modal state
    setIsModalOpen(false);
    setTargetToDismiss(null);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans relative">
      
      {/* Top Banner Navigation */}
      <header className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-wider text-emerald-500">LANNESS</h1>
          <p className="text-xs text-slate-400">Tactical Perimeter Security Hub</p>
        </div>
        <div className="flex items-center gap-4 text-sm bg-slate-900 px-4 py-2 rounded border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-slate-300 font-mono">T-SIM7080G Link: Connected</span>
          </div>
        </div>
      </header>

      {/* Grid Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side: Video Array */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Live Tower Camera Array</h2>
              <span className="text-xs font-mono bg-slate-800 px-2 py-0.5 rounded text-emerald-400">Arducam IMX477 Array</span>
            </div>
            
            <div className="relative aspect-video bg-slate-950 rounded border border-slate-800 flex items-center justify-center overflow-hidden">
              <div className="absolute top-3 left-3 bg-black/60 px-2 py-1 rounded text-xs font-mono tracking-widest text-white">
                CAM_FEED_{cameraDirection} // STREAM_LIVE
              </div>
              <div className="text-center p-4">
                <p className="text-sm text-slate-500 uppercase tracking-widest font-mono">[ Simulating Video Channel {cameraDirection} ]</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-3">
              {(['N', 'S', 'E', 'W'] as const).map((dir) => (
                <button
                  key={dir}
                  onClick={() => setCameraDirection(dir)}
                  className={`py-2 text-xs font-mono font-bold rounded border transition-colors ${
                    cameraDirection === dir
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  Direction {dir}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Right Side: Security Intelligence Center */}
        <div className="space-y-6">
          <section className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col h-[420px]">
            {/* Tab Header Controls */}
            <div className="flex border-b border-slate-800 mb-4">
              <button
                onClick={() => setActiveTab('current')}
                className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  activeTab === 'current' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Current Threat
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 pb-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                  activeTab === 'history' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Trigger History
              </button>
            </div>

            {/* Tab Container Display Panels */}
            <div className="flex-1 overflow-y-auto space-y-3 font-mono">
              {activeTab === 'current' ? (
                showCurrentThreat ? (
                  <div className="bg-red-950/20 border border-red-900/40 p-4 rounded text-sm space-y-5 flex flex-col justify-between max-h-[320px]">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-red-400 font-bold tracking-wide">⚠️ ACTIVE INCIDENT</span>
                        <span className="text-xs text-red-500 animate-pulse">Live</span>
                      </div>
                      <div className="text-xs space-y-1.5 text-slate-300">
                        <p><span className="text-slate-500">Sector:</span> East Cardinal Approach</p>
                        {/* Note: Trigger field deleted per requirements profile specifications */}
                        <p><span className="text-slate-500">Metrics:</span> High-frequency acoustic RPM signature (Drone profile matching)</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => initiateDismissal('current')}
                      className="w-full mt-2 bg-red-900/30 hover:bg-red-900/50 border border-red-700/40 text-red-200 text-xs py-2 rounded transition-colors uppercase font-bold tracking-wide"
                    >
                      Dismiss Threat Report
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-12 text-xs text-slate-500 italic">
                    No active threats reporting. Perimeter secure.
                  </div>
                )
              ) : (
                <div className="space-y-2 max-h-[325px] overflow-y-auto pr-1">
                  {systemLogs.length > 0 ? (
                    systemLogs.map((log) => (
                      <div key={log.id} className="bg-slate-950 p-3 rounded border border-slate-800 text-xs relative group">
                        <button 
                          onClick={() => initiateDismissal(log.id)}
                          className="absolute top-2 right-2 text-slate-600 hover:text-red-400 text-sm font-sans px-1 transition-colors"
                          title="Clear from log history"
                        >
                          ✕
                        </button>
                        <div className="flex justify-between text-slate-500 mb-1 pr-4">
                          <span>{log.timestamp}</span>
                          <span className="text-emerald-500">{log.zone}</span>
                        </div>
                        <p className="text-slate-200 font-semibold">{log.sensor}</p>
                        <p className="text-slate-400 text-[11px] mt-0.5">↳ Status: {log.status}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-xs text-slate-500 italic">
                      Trigger history fully cleared.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Double Approval Confirmation Modal Backing */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full shadow-xl font-mono">
            <h3 className="text-sm font-bold uppercase text-amber-500 tracking-wider mb-2">
              ⚠️ Priority Level-2 Action Required
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              You are completing an administrative override to clear this telemetry event layer. This action cannot be reverted automatically. Do you confirm this security command?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setIsModalOpen(false); setTargetToDismiss(null); }}
                className="bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs px-4 py-2 rounded border border-slate-800 transition-colors"
              >
                Cancel Override
              </button>
              <button
                onClick={confirmDismissal}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded transition-colors"
              >
                Confirm System Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}