// src/app/dashboard/WebRtcCameraFeed.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * WebRtcCameraFeed — WHEP client for MediaMTX
 * ---------------------------------------------------------------------------
 * REPLACES the Firebase peer-to-peer signalling that used to live here.
 *
 * The old approach wrote an SDP offer into Firebase, polled for the Pi's
 * answer, and negotiated a direct connection. That worked on the same WiFi
 * only, and supported exactly ONE viewer — a second browser would overwrite
 * the offer and displace the first.
 *
 * WHEP is a single POST. The browser sends its offer, MediaMTX returns an
 * answer, and the media flows from the server. Many viewers can read the same
 * path simultaneously, from anywhere the server is reachable.
 *
 * MUST be HTTPS. The dashboard is served over HTTPS, and a browser silently
 * blocks an HTTPS page from fetching plain HTTP — the stream would simply
 * never appear, with no error.
 */

const MEDIAMTX_BASE = "https://lannes-dashboard.duckdns.org";

const PATH_FOR: Record<string, string> = {
  Front: "front",
  Rear: "rear",
};

interface WebRtcCameraFeedProps {
  currentDirection: "Front" | "Rear";
}

export default function WebRtcCameraFeed({ currentDirection }: WebRtcCameraFeedProps) {
  const [connectionState, setConnectionState] = useState<string>("INITIALIZING");
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    let isMounted = true;
    let retryTimer: ReturnType<typeof setTimeout>;

    const streamPath = PATH_FOR[currentDirection] ?? "front";
    const whepUrl = `${MEDIAMTX_BASE}/${streamPath}/whep`;

    const connect = async () => {
      try {
        setConnectionState("NEGOTIATING");

        // No ICE servers needed: MediaMTX has a public address and relays the
        // media itself, which is what a TURN server would otherwise do.
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0] && isMounted) {
            videoRef.current.srcObject = event.streams[0];
            setConnectionState("STREAM_ONLINE");
          }
        };

        pc.addTransceiver("video", { direction: "recvonly" });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait for ICE gathering. WHEP is a single exchange, so candidates
        // must be in the SDP rather than trickled afterwards.
        await new Promise<void>((resolve) => {
          if (pc.iceGatheringState === "complete") return resolve();
          const check = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", check);
              resolve();
            }
          };
          pc.addEventListener("icegatheringstatechange", check);
          setTimeout(resolve, 2000); // don't hang if a candidate stalls
        });

        const res = await fetch(whepUrl, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: pc.localDescription?.sdp ?? offer.sdp,
        });

        if (!res.ok) {
          // 404 here means nothing is publishing to that path — the Pi is not
          // sending, rather than anything being wrong with the browser.
          throw new Error(`WHEP ${res.status}: ${res.statusText}`);
        }

        const answerSdp = await res.text();
        if (!isMounted) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

        pc.oniceconnectionstatechange = () => {
          if (!isMounted) return;
          const st = pc.iceConnectionState;
          if (st === "connected" || st === "completed") {
            setConnectionState("STREAM_ONLINE");
          } else if (st === "disconnected" || st === "failed") {
            setConnectionState("LINK_DROPPED");
            retryTimer = setTimeout(connect, 5000);
          }
        };
      } catch (error) {
        console.error("WHEP connection failed:", error);
        if (!isMounted) return;
        setConnectionState("NO_STREAM");
        // The Pi may simply not be publishing yet — keep trying quietly.
        retryTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, [currentDirection]);

  const online = connectionState === "STREAM_ONLINE";

  return (
    <div className="w-full h-full relative flex items-center justify-center bg-slate-950">
      {/* Direction Overlay Tag */}
      <div className="absolute top-3 left-3 bg-black/75 px-2 py-1 rounded text-[10px] tracking-widest text-white z-10 font-mono">
        CAM_FEED_{currentDirection} // {online ? "STREAM_LIVE" : "OFFLINE"}
      </div>

      {/* Connection State Badge Overlay */}
      <div className="absolute top-3 right-3 bg-slate-900/90 border border-slate-800 px-2 py-0.5 rounded text-[9px] font-mono tracking-wider z-10">
        <span
          className={`w-1.5 h-1.5 rounded-full inline-block mr-1.5 ${
            online ? "bg-emerald-400 animate-pulse" : "bg-amber-500"
          }`}
        ></span>
        <span className={online ? "text-emerald-400" : "text-slate-400"}>{connectionState}</span>
      </div>

      {/* Native WebRTC HTML5 Player */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ display: online ? "block" : "none" }}
      />

      {/* Fallback Sync Spinner */}
      {!online && (
        <div className="text-center p-6 space-y-2 font-mono">
          <span className="w-5 h-5 rounded-full border-2 border-t-transparent border-emerald-500 animate-spin block mx-auto"></span>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest pt-1">[ WHEP: {connectionState} ]</p>
        </div>
      )}
    </div>
  );
}
