"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { buildAuthPath, readAuthProfileSummary, supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

interface ToolbarProps {
    showDebugButton?: boolean;
}

export default function Toolbar({ showDebugButton = true }: ToolbarProps) {
    const pathname = usePathname();
    const { userId, username, emailVerified, setAuth, logout, debugMode, toggleDebugMode } = useGameStore();
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const returnPath = pathname && !pathname.startsWith("/auth") ? pathname : "/account";
    const loginHref = buildAuthPath("login", returnPath);
    const sectionLabel = pathname?.startsWith("/bandori/calendar")
        ? "活动日历"
        : pathname?.startsWith("/bandori/eventtracker")
            ? "活动追踪"
            : pathname?.startsWith("/account")
                ? "账号中心"
                : pathname?.startsWith("/auth")
                    ? "账号访问"
                    : "首页";
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
        <header className="relative z-[250] border-b border-slate-200/80 bg-white/88 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <Link href="/" className="text-lg font-semibold tracking-[0.12em] text-slate-950 transition hover:text-sky-600">
                            HHWX
                        </Link>
                        <span className="hidden h-4 w-px bg-slate-300 sm:block" aria-hidden="true" />
                        <span className="text-xs font-medium uppercase tracking-[0.32em] text-slate-400 sm:text-[11px]">
                            Happy Lucky Othello
                        </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span className="font-semibold tracking-[0.18em] text-slate-900">{sectionLabel}</span>
                        <span className="text-slate-300">/</span>
                        <span>统一账号与页面导航入口</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {shouldShowDebugButton && (
                        <button
                            onClick={toggleDebugMode}
                            className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${debugMode
                                    ? "border-cyan-500 bg-cyan-500 text-white shadow-[0_8px_18px_rgba(6,182,212,0.22)]"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                                }`}
                            title="开启后在 AI 回合显示落子权重"
                        >
                            <span aria-hidden="true">🔍</span>
                            <span>{debugMode ? "调试开启" : "调试"}</span>
                        </button>
                    )}

                    <div ref={menuRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setShowMenu((currentValue) => !currentValue)}
                            className="group relative flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                            aria-label={userId ? "打开账户菜单" : "打开登录入口"}
                        >
                            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                                {userId ? (
                                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-bold text-white">
                                        {(username || "U")[0].toUpperCase()}
                                    </span>
                                ) : (
                                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                        <path d="M18 20a6 6 0 0 0-12 0" strokeLinecap="round" />
                                        <circle cx="12" cy="8" r="4" />
                                    </svg>
                                )}
                                {userId && !emailVerified && (
                                    <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />
                                )}
                            </span>
                            <span className="hidden min-w-0 sm:block">
                                <span className="block truncate text-sm font-semibold text-slate-900">
                                    {userId ? username || "未命名用户" : "账户入口"}
                                </span>
                                <span className="block truncate text-xs text-slate-500">
                                    {userId
                                        ? (emailVerified ? "已验证" : "邮箱未验证")
                                        : "登录后管理账号设置"}
                                </span>
                            </span>
                        </button>

                        {showMenu && (
                            <div className="absolute right-0 top-full mt-3 w-64 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]">
                                <div className="border-b border-slate-100 px-5 py-4">
                                    <div className="text-sm font-semibold text-slate-900">
                                        {userId ? username || "未命名用户" : "账户入口"}
                                    </div>
                                    <div className="mt-1 text-xs leading-5 text-slate-500">
                                        {userId
                                            ? (emailVerified ? "已完成邮箱验证。" : "邮箱尚未验证。")
                                            : "使用邮箱登录后，可进入账号中心管理资料和设置。"}
                                    </div>
                                </div>

                                {userId ? (
                                    <div className="py-2">
                                        <Link
                                            href="/account"
                                            onClick={() => setShowMenu(false)}
                                            className="block px-5 py-3 text-sm text-slate-700 transition hover:bg-slate-50"
                                        >
                                            账号中心
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="block w-full px-5 py-3 text-left text-sm text-red-500 transition hover:bg-red-50"
                                        >
                                            登出
                                        </button>
                                    </div>
                                ) : (
                                    <div className="py-2">
                                        <Link
                                            href={loginHref}
                                            onClick={() => setShowMenu(false)}
                                            className="block px-5 py-3 text-sm text-slate-700 transition hover:bg-slate-50"
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

