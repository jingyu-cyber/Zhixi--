"use client";

import dynamic from "next/dynamic";
import { memo } from "react";

const FallingPetals = dynamic(() => import("@/components/FallingPetals"), {
  ssr: false,
});

const MemoPetals = memo(function PetalsWrapper() {
  return <FallingPetals />;
});

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MemoPetals />
      {children}
    </>
  );
}
