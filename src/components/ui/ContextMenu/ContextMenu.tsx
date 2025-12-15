/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Check } from "lucide-react";
import "./ContextMenu.css";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy: () => void;
  selectedText: string;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onCopy,
  selectedText,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  if (!selectedText) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy();
    setIsCopied(true);
    setTimeout(() => {
      onClose();
    }, 500);
  };

  // Use createPortal to render outside the main DOM hierarchy
  // allowing it to sit above everything else (MsgBox, Modals, etc.)
  return createPortal(
    <>
      {/* Invisible overlay to close menu when clicking outside */}
      <div 
        className="fixed inset-0 z-[9998] cursor-default" 
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      
      {/* The actual menu */}
      <div
        id="app-context-menu"
        className="context-menu fixed z-[9999] min-w-[120px]"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()} // Prevent click from bubbling to "outside click" listeners
      >
        <button
          onClick={handleCopy}
          className="context-menu-item w-full text-left flex items-center gap-2"
        >
           {isCopied ? <Check size={14} /> : <Copy size={14} />}
           <span>Copy</span>
        </button>
      </div>
    </>,
    document.body
  );
};
