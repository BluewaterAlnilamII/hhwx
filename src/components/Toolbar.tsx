"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { buildAuthPath, readAuthProfileSummary, supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

interface ToolbarProps {
    showDebugButton?: boolean;
    isSidebarOpen?: boolean;
    onToggleSidebar?: () => void;
}

export default function Toolbar({ showDebugButton = true, isSidebarOpen = false, onToggleSidebar }: ToolbarProps) {
    const pathname = usePathname();
    const { userId, username, emailVerified, setAuth, logout, debugMode, toggleDebugMode } = useGameStore();
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const returnPath = pathname && !pathname.startsWith("/auth") ? pathname : "/account";
    const loginHref = buildAuthPath("login", returnPath);
    const shouldShowDebugButton = showDebugButton && pathname === "/";

    // Restore session on mount
    useEffect(() => {
        const syncAuthState = async () => {
            const summary = await readAuthProfileSummary();
            if (!summary) {
                logout();
                return;
            }

            setAuth({
                userId: summary.userId,
                username: summary.username,
                userEmail: summary.email,
                emailVerified: summary.emailVerified,
            });
        };

        void syncAuthState();

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                logout();
                return;
            }

            void readAuthProfileSummary(session).then((summary) => {
                if (!summary) {
                    logout();
                    return;
                }

                setAuth({
                    userId: summary.userId,
                    username: summary.username,
                    userEmail: summary.email,
                    emailVerified: summary.emailVerified,
                });
            });
        });

        return () => subscription.unsubscribe();
    }, [setAuth, logout]);

    useEffect(() => {
        if (!showMenu) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [showMenu]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        logout();
        setShowMenu(false);
    };

    return (
        <header className="fixed inset-x-0 top-0 z-[250] border-b border-white/85 bg-[#FF9922] shadow-[0_10px_24px_rgba(255,153,34,0.28)]">
            <div className="flex h-[58px] w-full items-center justify-between gap-2 px-3 sm:px-4 lg:justify-end lg:px-5">
                <div className="lg:hidden">
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        className="group relative flex h-8 w-8 items-center justify-center rounded-[14px] border border-white/45 bg-white/16 text-left shadow-[0_6px_16px_rgba(122,61,0,0.16)] backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:border-white/75 hover:bg-white/30 hover:shadow-[0_10px_24px_rgba(122,61,0,0.22)]"
                        aria-label={isSidebarOpen ? "关闭页面导航" : "打开页面导航"}
                    >
                        <span className="relative flex h-6 w-6 items-center justify-center rounded-[12px] bg-[#fff4db] text-[#c76400] transition duration-200 group-hover:scale-105 group-hover:bg-[#fff7e7]">
                            {isSidebarOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
                        </span>
                    </button>
                </div>

                <div className="flex items-center gap-2.5">
                    {shouldShowDebugButton && (
                        <button
                            onClick={toggleDebugMode}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-[14px] border backdrop-blur-sm transition duration-200 ${debugMode
                                    ? "border-white/80 bg-white text-[#c76400] shadow-[0_8px_20px_rgba(122,61,0,0.2)]"
                                    : "border-white/45 bg-white/16 text-white shadow-[0_6px_16px_rgba(122,61,0,0.14)] hover:-translate-y-0.5 hover:scale-[1.03] hover:border-white/70 hover:bg-white/30 hover:shadow-[0_10px_24px_rgba(122,61,0,0.2)]"
                                }`}
                            title="开启后在 AI 回合显示落子权重"
                            aria-label={debugMode ? "关闭调试模式" : "开启调试模式"}
                        >
                            <span aria-hidden="true">🔍</span>
                        </button>
                    )}

                    <div ref={menuRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setShowMenu((currentValue) => !currentValue)}
                            className="group relative flex h-8 w-8 items-center justify-center rounded-[14px] border border-white/45 bg-white/16 text-left shadow-[0_6px_16px_rgba(122,61,0,0.16)] backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:border-white/75 hover:bg-white/30 hover:shadow-[0_10px_24px_rgba(122,61,0,0.22)]"
                            aria-label={userId ? "打开账户菜单" : "打开登录入口"}
                        >
                            <span className="relative flex h-6 w-6 items-center justify-center rounded-[12px] bg-[#fff4db] text-[#c76400] transition duration-200 group-hover:scale-105 group-hover:bg-[#fff7e7]">
                                {userId ? (
                                    <span className="flex h-6 w-6 items-center justify-center rounded-[12px] bg-[#fff4db] text-[11px] font-bold text-[#c76400]">
                                        {(username || "U")[0].toUpperCase()}
                                    </span>
                                ) : (
                                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                        <path d="M18 20a6 6 0 0 0-12 0" strokeLinecap="round" />
                                        <circle cx="12" cy="8" r="4" />
                                    </svg>
                                )}
                                {userId && !emailVerified && (
                                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-300 ring-2 ring-[#FF9922]" />
                                )}
                            </span>
                        </button>

                        {showMenu && (
                            <div className="absolute right-0 top-full mt-3 w-64 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
                                {userId ? (
                                    <div className="py-2">
                                        <Link
                                            href="/account"
                                            onClick={() => setShowMenu(false)}
                                            className="block px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                        >
                                            {emailVerified ? "账号中心" : "账号中心（待验证）"}
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="block w-full px-5 py-3 text-left text-sm font-medium text-red-500 transition hover:bg-red-50"
                                        >
                                            登出
                                        </button>
                                    </div>
                                ) : (
                                    <div className="py-2">
                                        <Link
                                            href={loginHref}
                                            onClick={() => setShowMenu(false)}
                                            className="block px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                        >
                                            登录
                                        </Link>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}

