/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import packageJson from "../../../../package.json";
import { invoke } from "@tauri-apps/api/core";

const RELEASE_NOTES_URL = "https://raw.githubusercontent.com/a7mddra/imgi/main/CHANGELOG.md";

export interface ReleaseInfo {
  version: string;
  notes: string;
  hasUpdate: boolean;
}

/**
 * Helper to log to both browser console and terminal
 */
function log(message: string) {
  console.log(message);
  invoke("log_to_terminal", { message }).catch(() => {});
}

/**
 * Compares two semantic version strings.
 * Returns 1 if v1 > v2, -1 if v1 < v2, and 0 if v1 === v2.
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export const fetchReleaseNotes = async (): Promise<ReleaseInfo> => {
  try {
    const response = await fetch(RELEASE_NOTES_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch release notes: ${response.statusText}`);
    }
    const text = await response.text();
    log("[ReleaseNotes] Fetched CHANGELOG.md successfully");
    
    // Regex to find "## X.Y.Z" headers
    const versionRegex = /^##\s+\[?(\d+\.\d+\.\d+)\]?/m;
    const match = text.match(versionRegex);
    
    if (!match) {
      log("[ReleaseNotes] No version header found in CHANGELOG");
      return { version: packageJson.version, notes: "", hasUpdate: false };
    }
    
    const latestVersion = match[1];
    log(`[ReleaseNotes] Latest version found: ${latestVersion}, Current version: ${packageJson.version}`);
    
    // Compare versions
    if (compareVersions(latestVersion, packageJson.version) <= 0) {
      log(`[ReleaseNotes] You are on the latest release (${packageJson.version})`);
      return { version: latestVersion, notes: "", hasUpdate: false };
    }
    
    log(`[ReleaseNotes] Update available! ${packageJson.version} -> ${latestVersion}`);
    
    // Extract notes for the latest version
    // Find the start of the version section
    const startIdx = match.index! + match[0].length;
    
    // Find the next version header or end of file
    const nextVersionRegex = /^##\s+\[?\d+\.\d+\.\d+\]?/m;
    const remainingText = text.slice(startIdx);
    const nextMatch = remainingText.match(nextVersionRegex);
    
    let versionSection = nextMatch 
      ? remainingText.slice(0, nextMatch.index) 
      : remainingText;
      
    // Filter for bullet points (lines starting with "- ")
    const notes = versionSection
      .split('\n')
      .filter(line => line.trim().startsWith('-'))
      .join('\n');

    return {
      version: latestVersion,
      notes: notes.trim(),
      hasUpdate: true
    };
    
  } catch (error) {
    log(`[ReleaseNotes] Error: ${error}`);
    // Return no update on error to be safe
    return { version: packageJson.version, notes: "", hasUpdate: false };
  }
};
