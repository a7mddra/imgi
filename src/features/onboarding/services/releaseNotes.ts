/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const RELEASE_NOTES_URL = "https://raw.githubusercontent.com/a7mddra/spatialshot/main/docs/LATESTRELEASE.md";

export const fetchReleaseNotes = async (): Promise<string> => {
  try {
    const response = await fetch(RELEASE_NOTES_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch release notes: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.error("Error fetching release notes:", error);
    throw error;
  }
};
