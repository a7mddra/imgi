/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { OnboardingLayout } from "../../layouts/OnboardingLayout";
import styles from "../../layouts/OnboardingLayout.module.css";
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
// FIX 1: Import invoke
import { invoke } from "@tauri-apps/api/core";

interface UpdateNotesProps {
  onClose: () => void;
  notes: string;
  version: string;
}

export const UpdateNotes: React.FC<UpdateNotesProps> = ({ onClose, notes, version }) => {
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState("");
  
  // FIX 2: Store content length from the 'Started' event to use in 'Progress'
  const totalSize = useRef<number>(0);

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
              // Capture total size here
              totalSize.current = event.data.contentLength || 0;
              setStatus(`Downloading update...`);
              break;
              
            case 'Progress':
              let percent = 0;
              // Only calculate if we have a valid total size
              if (totalSize.current > 0) {
                 // event.data.chunkLength is the size of the *current chunk*, 
                 // usually you need to accumulate this manually or just show "Downloading..." 
                 // However, Tauri v2 Progress event usually gives accumulated bytes in some versions, 
                 // BUT strict type says { chunkLength }. 
                 // If percentage is hard to calculate without an accumulator, a generic message is safer:
                 setStatus(`Downloading...`);
              } else {
                 setStatus(`Downloading...`);
              }
              break;
              
            case 'Finished':
              setStatus("Install complete. Restarting...");
              break;
          }
        });
        
        await relaunch();
        
      } else {
        // Fallback: No binary update found via Tauri, use browser
        setStatus("Opening download page...");
        setTimeout(() => {
            invoke("open_external_url", { url: "https://github.com/a7mddra/spatialshot/releases/latest" });
            onClose();
        }, 1500);
      }
    } catch (error) {
      console.error(error);
      // Fallback: Error during update, use browser
      setStatus("Error. Opening browser...");
      setTimeout(() => {
        invoke("open_external_url", { url: "https://github.com/a7mddra/spatialshot/releases/latest" });
        onClose();
      }, 1500);
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
      primaryLabel={updating ? status : "Install Now"}
      disablePrimary={updating}
      onSecondaryAction={onClose}
      secondaryLabel="Maybe later"
      hideButtons={false}
    >
      <div className="flex flex-col h-full space-y-3" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <h3 style={{ fontSize: '1.1em', fontWeight: 'bold', margin: '0.5em 0', color: 'black' }}>
          What's Changed
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