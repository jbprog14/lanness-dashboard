// src/app/dashboard/WebRtcCameraFeed.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

interface WebRtcCameraFeedProps {
  currentDirection: "N" | "S" | "E" | "W";
}

export default function WebRtcCameraFeed({ currentDirection }: WebRtcCameraFeedProps) {
  // Initialize the state directly to 'INITIALIZING' instead of toggling it inside the effect
  const [connectionState, setConnectionState] = useState<string>("INITIALIZING");
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    let checkAnswerInterval: NodeJS.Timeout;
    let isMounted = true;

    const establishTunnel = async () => {
      try {
        // 1. Establish peer connections via standard fallback ICE pathways mapping profiles
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        // 2. Handle data track assignment configurations
        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0] && isMounted) {
            videoRef.current.srcObject = event.streams[0];
            setConnectionState("STREAM_ONLINE");
          }
        };

        // Instruct browser to ready a track for downstream video frames ingestion
        pc.addTransceiver("video", { direction: "recvonly" });

        // 3. Compile local browser device signature profile configuration offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const signalingUrl = "https://lanness-sytem-default-rtdb.firebaseio.com/webrtc_signaling.json";

        // Clean old channel sessions out of the coordination path matrix
        await fetch(signalingUrl, { method: "DELETE" });

        // Post new connection parameters entry vector onto Firebase
        await fetch(signalingUrl, {
          method: "PUT",
          body: JSON.stringify({
            offer: { type: offer.type, sdp: offer.sdp },
          }),
        });

        if (!isMounted) return;
        setConnectionState("AWAITING_PEER");

        // 4. Poll database matrix loop waiting for Pi 5 response answer token
        checkAnswerInterval = setInterval(async () => {
          try {
            const response = await fetch(signalingUrl);
            const data = await response.json();

            if (data && data.answer && isMounted) {
              clearInterval(checkAnswerInterval);
              await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
              setConnectionState("STREAM_ONLINE");
            }
          } catch (err) {
            console.error("Failed pulling response parameters from signaling hub:", err);
          }
        }, 1500);

        pc.oniceconnectionstatechange = () => {
          if (!isMounted) return;
          if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
            setConnectionState("LINK_DROPPED");
          }
        };
      } catch (error) {
        console.error("WebRTC Setup Error:", error);
        if (isMounted) setConnectionState("SETUP_FAILED");
      }
    };

    // Run the async sequence cleanly inside the effect
    establishTunnel();

    // Clean up connections and stop memory leaks when component unmounts
    return () => {
      isMounted = false;
      if (checkAnswerInterval) clearInterval(checkAnswerInterval);
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
    };
  }, []); // Empty dependency array ensures this runs exactly once on mount

  return (
    <div className="w-full h-full relative flex items-center justify-center bg-slate-950">
      {/* Direction Overlay Tag */}
      <div className="absolute top-3 left-3 bg-black/75 px-2 py-1 rounded text-[10px] tracking-widest text-white z-10 font-mono">
        CAM_FEED_{currentDirection || "N"} // STREAM_LIVE
      </div>

      {/* Connection State Badge Overlay */}
      <div className="absolute top-3 right-3 bg-slate-900/90 border border-slate-800 px-2 py-0.5 rounded text-[9px] font-mono tracking-wider z-10">
        <span
          className={`w-1.5 h-1.5 rounded-full inline-block mr-1.5 ${
            connectionState === "STREAM_ONLINE" ? "bg-emerald-400 animate-pulse" : "bg-amber-500"
          }`}
        ></span>
        <span className={connectionState === "STREAM_ONLINE" ? "text-emerald-400" : "text-slate-400"}>
          {connectionState}
        </span>
      </div>

      {/* Native WebRTC HTML5 Player */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ display: connectionState === "STREAM_ONLINE" ? "block" : "none" }}
      />

      {/* Fallback Sync Spinner */}
      {connectionState !== "STREAM_ONLINE" && (
        <div className="text-center p-6 space-y-2 font-mono">
          <span className="w-5 h-5 rounded-full border-2 border-t-transparent border-emerald-500 animate-spin block mx-auto"></span>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest pt-1">[ P2P TUNNEL: {connectionState} ]</p>
        </div>
      )}
    </div>
  );
}
