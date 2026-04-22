"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import SectionSidebarShell from "@/components/SectionSidebarShell";
import Toolbar from "@/components/Toolbar";

interface AppChromeProps {
  children: ReactNode;
}

export default function AppChrome({ children }: AppChromeProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden">
      <Toolbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((currentValue) => !currentValue)}
      />
      <div className="h-[58px] shrink-0" aria-hidden="true" />
      <SectionSidebarShell
        isMobileDrawerOpen={isSidebarOpen}
        onCloseMobileDrawer={() => setIsSidebarOpen(false)}
      >
        {children}
      </SectionSidebarShell>
    </div>
  );
}