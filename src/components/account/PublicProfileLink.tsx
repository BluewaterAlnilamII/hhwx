"use client";

import { createContext, useContext, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export const ProfileNavigationContext = createContext<(() => void) | undefined>(undefined);

export function PublicProfileLink({ publicUid, children, className, avatarLabel }: {
  publicUid: number | null;
  children: ReactNode;
  className?: string;
  avatarLabel?: string;
}) {
  const onNavigate = useContext(ProfileNavigationContext);
  if (publicUid == null) return avatarLabel ? children : <span className={className}>{children}</span>;
  return <Link href={`/user/${publicUid}`} prefetch={false} onNavigate={onNavigate} aria-label={avatarLabel}
    className={cn(avatarLabel ? "hhwx-text-link relative block w-fit shrink-0 rounded-full" : "hhwx-title-link", className)}>
    {children}
  </Link>;
}
