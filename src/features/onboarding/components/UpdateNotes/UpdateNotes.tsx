/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { OnboardingLayout } from "../../layouts/OnboardingLayout";
import styles from "../../layouts/OnboardingLayout.module.css";
import { fetchReleaseNotes } from "../../services/releaseNotes"; // Adjust path as needed

interface UpdateNotesProps {
  onClose: () => void;
}

export const UpdateNotes: React.FC<UpdateNotesProps> = ({ onClose }) => {
  const [markdownContent, setMarkdownContent] = useState<string>("Loading release notes...");

  useEffect(() => {
    let isMounted = true;

    fetchReleaseNotes()
      .then((text) => {
        if (isMounted) setMarkdownContent(text);
      })
      .catch(() => {
        if (isMounted) {
          setMarkdownContent("# Error\nCould not load the latest release notes. Please check your internet connection.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <OnboardingLayout
      title="What's New"
      description="Check out the latest features and improvements."
      icon={
        <img
          src="/assets/steps/emoji_u1f6e0.png" 
          /* Ensure you have a 'party popper' or similar icon asset, 
             or use a generic one */
          className={styles.iconImage}
          alt="Update"
        />
      }
      onPrimaryAction={onClose}
      primaryLabel="Close"
      hideButtons={false}
      // No secondary action needed for a simple changelog modal
    >
      <div className="flex flex-col h-full space-y-3" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
            {markdownContent}
          </ReactMarkdown>
        </div>
      </div>
    </OnboardingLayout>
  );
};