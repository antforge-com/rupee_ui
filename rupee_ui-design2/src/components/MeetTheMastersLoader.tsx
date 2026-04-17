import React from "react";
import logoImg from "../assests/Meetmasterslogopng.png";

interface Props {
  size?: number;
  message?: string;
  padding?: string | number;
}

export const MeetTheMastersLoader: React.FC<Props> = ({
  size = 56,
  message,
  padding = 40,
}) => (
  <div style={{ textAlign: "center", padding, color: "#64748B" }}>
    <img
      src={logoImg}
      alt="Meet The Masters"
      style={{
        inlineSize: size,
        blockSize: "auto",
        display: "block",
        margin: `0 auto${message ? " 12px" : ""}`,
        animation: "mtmPulse 1.8s ease-in-out infinite",
      }}
    />
    {message && <div style={{ fontSize: 13, fontWeight: 600 }}>{message}</div>}
    <style>{`@keyframes mtmPulse { 0% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } 20% { opacity: 0.6; } 50% { transform: scale(1.10); filter: blur(0px) drop-shadow(0 0 22px rgba(15,118,110,0.65)); opacity: 1.0; } 80% { opacity: 0.6; } 100% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } }`}</style>
  </div>
);
