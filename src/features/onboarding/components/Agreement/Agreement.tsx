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

interface AgreementProps {
  osType: string; // e.g., 'windows', 'macos', 'linux'
  onNext: () => void;
  onCancel: () => void;
}

export const Agreement: React.FC<AgreementProps> = ({
  osType,
  onNext,
  onCancel,
}) => {
  const [markdownContent, setMarkdownContent] = useState<string>("");
  const [isAgreed, setIsAgreed] = useState(false);

  useEffect(() => {
    // Fetch instructions from public/data/instructions/{os}.md
    // Adjust path based on your actual public folder structure
    fetch(`/instructions/${osType}.md`)
      .then((res) => {
        if (!res.ok) throw new Error("Instruction file not found");
        return res.text();
      })
      .then((text) => setMarkdownContent(text))
      .catch((err) => {
        console.error("Failed to load instructions:", err);
        setMarkdownContent("# Error\nCould not load installation instructions.");
      });
  }, [osType]);

  return (
    <OnboardingLayout
      title="Setup Guide"
      description="Please review the following instructions carefully."
      icon={
        <img
          src="/assets/steps/emoji_u1f4c4.png"
          className={styles.iconImage}
          alt="Guide"
        />
      }
      onPrimaryAction={onNext}
      disablePrimary={!isAgreed}
      primaryLabel="Next"
      onSecondaryAction={onCancel}
      secondaryLabel="Cancel"
    >
      <div className="flex flex-col h-full space-y-3" style={{ height: "100%", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div className="text-sm text-gray-700 shrink-0">
          This guide contains critical information about permissions and troubleshooting.
        </div>

        <div className={styles.markdownScroll}>
          {/* We wrap ReactMarkdown to ensure lists and headers inside are styled. 
              The 'prose' or specific markdown styles can be added to global css or inline here.
              For simplicity, basic markdown styles are handled by browser defaults or your global reset,
              but we can force some specifics if needed. */}
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              // Simple inline styles to ensure basic formatting if global styles are missing
              h1: ({node, ...props}) => <h1 style={{fontSize: '1.5em', fontWeight: 'bold', margin: '0.5em 0'}} {...props} />,
              h2: ({node, ...props}) => <h2 style={{fontSize: '1.25em', fontWeight: 'bold', margin: '0.5em 0'}} {...props} />,
              ul: ({node, ...props}) => <ul style={{listStyleType: 'disc', paddingLeft: '1.5em'}} {...props} />,
              li: ({node, ...props}) => <li style={{marginBottom: '0.25em'}} {...props} />,
              p: ({node, ...props}) => <p style={{marginBottom: '1em'}} {...props} />,
            }}
          >
            {markdownContent}
          </ReactMarkdown>
        </div>

        <div className={styles.radioGroup}>
          <label className={styles.radioOption}>
            <input
              type="radio"
              name="agreement"
              className={styles.radioInput}
              checked={isAgreed}
              onChange={() => setIsAgreed(true)}
            />
            <span>I have read and understand the instructions</span>
          </label>
          <label className={styles.radioOption}>
            <input
              type="radio"
              name="agreement"
              className={styles.radioInput}
              checked={!isAgreed}
              onChange={() => setIsAgreed(false)}
            />
            <span>I do not understand</span>
          </label>
        </div>
      </div>
    </OnboardingLayout>
  );
};