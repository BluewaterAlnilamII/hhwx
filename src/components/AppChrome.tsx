"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import SectionSidebarShell from "@/components/SectionSidebarShell";
import Toolbar from "@/components/Toolbar";
import MusicPlayerHost from "@/components/music-player/MusicPlayerHost";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { useBandoriCardsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";

interface AppChromeProps {
  children: ReactNode;
}

function BandoriCardsPreloader() {
  useBandoriCardsMaster();
  useBandoriCardsAssetIndex();
  return null;
}

export default function AppChrome({ children }: AppChromeProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen min-h-svh flex-col">
      <BandoriCardsPreloader />
      <MusicPlayerHost />
      <Toolbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((currentValue) => !currentValue)}
      />
      <SectionSidebarShell
        isMobileDrawerOpen={isSidebarOpen}
        onCloseMobileDrawer={() => setIsSidebarOpen(false)}
      >
        {children}
      </SectionSidebarShell>
    </div>
  );
}
