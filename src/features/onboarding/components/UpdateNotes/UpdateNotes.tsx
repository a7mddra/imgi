/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { OnboardingLayout } from "../../layouts/OnboardingLayout";
import styles from "../../layouts/OnboardingLayout.module.css";
// import { check } from '@tauri-apps/plugin-updater'; 
// import { relaunch } from '@tauri-apps/plugin-process';
// We will use dynamic imports or assume global availability if plugins are not strictly typed in this context yet.
// For now, I will use standard imports assuming the user has or will install them.
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface UpdateNotesProps {
  onClose: () => void;
  notes: string;
  version: string;
}

export const UpdateNotes: React.FC<UpdateNotesProps> = ({ onClose, notes, version }) => {
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState("");

  const handleUpdate = async () => {
    setUpdating(true);
    setStatus("Checking for updates...");
    try {
      const update = await check();
      if (update && update.available) {
        setStatus(`Downloading update ${update.version}...`);
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              setStatus(`Downloading update...`);
              break;
            case 'Progress':
              setStatus(`Downloading: ${Math.round(event.data.chunkLength / event.data.contentLength! * 100)}%`);
              break;
            case 'Finished':
              setStatus("Install complete. Restarting...");
              break;
          }
        });
        await relaunch();
      } else {
        setStatus("No update found via updater (version mismatch?).");
        setTimeout(() => setUpdating(false), 2000);
      }
    } catch (error) {
      console.error(error);
      setStatus("Update failed. Please try again later.");
      setTimeout(() => setUpdating(false), 3000);
    }
  };

  return (
    <OnboardingLayout
      title={`New Update Available: ${version}`}
      description="Check out the latest features and improvements."
      icon={
        <img
          src="/assets/emoji_u1f4e6.png" 
          className={styles.iconImage}
          alt="Update"
        />
      }
      onPrimaryAction={handleUpdate}
      primaryLabel={updating ? status : "Update Now"}
      disablePrimary={updating}
      onSecondaryAction={onClose}
      secondaryLabel="Maybe later"
      hideButtons={false}
    >
      <div className="flex flex-col h-full space-y-3" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <h3 style={{ fontSize: '1.1em', fontWeight: 'bold', margin: '0.5em 0' }}>
          here are the new key features !:
        </h3>
        <div className={styles.markdownScroll} style={{ marginTop: 0 }}>
           <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              h1: ({node, ...props}) => <h1 style={{fontSize: '1.5em', fontWeight: 'bold', margin: '0.5em 0'}} {...props} />,
              h2: ({node, ...props}) => <h2 style={{fontSize: '1.25em', fontWeight: 'bold', margin: '0.5em 0'}} {...props} />,
              h3: ({node, ...props}) => <h3 style={{fontSize: '1.1em', fontWeight: 'bold', margin: '0.5em 0'}} {...props} />,
              ul: ({node, ...props}) => <ul style={{listStyleType: 'disc', paddingLeft: '1.5em'}} {...props} />,
              li: ({node, ...props}) => <li style={{marginBottom: '0.25em'}} {...props} />,
              p: ({node, ...props}) => <p style={{marginBottom: '1em'}} {...props} />,
              a: ({node, ...props}) => <a style={{color: '#2563eb', textDecoration: 'underline'}} target="_blank" rel="noopener noreferrer" {...props} />
            }}
          >
            {notes}
          </ReactMarkdown>
        </div>
      </div>
    </OnboardingLayout>
  );
};