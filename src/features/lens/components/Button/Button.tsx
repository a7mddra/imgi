import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core"; // Import invoke
import styles from "./Button.module.css";

interface LensButtonProps {
  isChatMode: boolean;
}

const LensButton: React.FC<LensButtonProps> = ({ isChatMode }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLensPress = async () => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
        // Call the Rust boss
        await invoke("open_imgbb_window");
    } catch (e) {
        console.error("Failed to open window", e);
    }
    
    setIsLoading(false);
  };

  return (
    <button
      className={`${styles.lensBtn} ${isChatMode ? styles.chatMode : ""}`}
      onClick={handleLensPress}
      disabled={isLoading}
    >
      <span className={styles.btnBorder}></span>

      {isLoading ? (
        <svg viewBox="0 0 24 24" fill="none" className={styles.spinner}>
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeDasharray="31.415, 31.415"
            strokeDashoffset="15.7075"
          ></circle>
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
          <circle cx="12" cy="13" r="3"></circle>
        </svg>
      )}

      <div className={styles.reelWindow}>
        <div className={styles.reelStrip}>
          <span>Use Google Lens</span>
          <span>Copy Text</span>
          <span>Translate</span>
          <span>Image Search</span>
          <span>QR Codes</span>
          <span>Use Google Lens</span>
        </div>
      </div>
    </button>
  );
};

export default LensButton;
