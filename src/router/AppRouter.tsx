import React from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { Welcome } from "../features/onboarding"; // Ensure this export exists in onboarding/index.ts
import { useAuth } from "../features/auth";

export const AppRouter: React.FC = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    // In a real app, you might have a dedicated route for this
    return <Welcome onImageReady={() => console.log("Image Ready - logic needed")} />;
  }

  return <AppLayout />;
};