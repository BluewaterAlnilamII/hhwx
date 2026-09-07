"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Root as SidebarDialog } from "@radix-ui/react-dialog";
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

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) setIsSidebarOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <SidebarDialog open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
      <div className="relative flex min-h-screen min-h-svh flex-col">
        <BandoriCardAvatarResourcesPreloader />
        <MusicPlayerHost />
        <Toolbar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((currentValue) => !currentValue)}
        />
        <SectionSidebarShell onCloseMobileDrawer={() => setIsSidebarOpen(false)}>
          {children}
        </SectionSidebarShell>
      </div>
    </SidebarDialog>
  );
}
