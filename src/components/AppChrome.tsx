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
    <div className="relative flex min-h-screen min-h-svh flex-col">
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
