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

/**
 * Account card avatars can appear in the toolbar on every route. Start both
 * catalogs together so the first avatar does not create a master-to-index
 * request waterfall, and keep their snapshots pinned for this page lifetime.
 */
function BandoriCardAvatarResourcesPreloader() {
  useBandoriCardsMaster();
  useBandoriCardsAssetIndex();
  return null;
}

export default function AppChrome({ children }: AppChromeProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen min-h-svh flex-col">
      <BandoriCardAvatarResourcesPreloader />
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
