// FILE: src/lib/types/tauri.types.ts

export interface ImageResponse {
  base64: string;
  mimeType: string;
}

export interface UserData {
  name: string;
  email: string;
  avatar: string;
}