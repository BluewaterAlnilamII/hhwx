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
    const sectionLabel = pathname?.startsWith("/account")
        ? "Account"
        : pathname?.startsWith("/auth")
            ? "Access"
            : "Home";

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
        <div className="fixed inset-x-0 top-0 z-[250] px-4 pt-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-6xl items-center justify-between rounded-[24px] border border-white/50 bg-white/70 px-4 py-3 shadow-[0_18px_48px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                <div className="min-w-0">
                    <Link href="/" className="text-base font-semibold tracking-[0.12em] text-slate-900 transition hover:text-sky-600">
                        HHWX
                    </Link>
                    <div className="mt-1 text-xs uppercase tracking-[0.28em] text-slate-500">
                        Happy Lucky Othello / {sectionLabel}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {showDebugButton && (
                        <button
                            onClick={toggleDebugMode}
                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg transition-all duration-200 ${debugMode
                                    ? "bg-cyan-500 text-white shadow-cyan-500/30"
                                    : "bg-white/80 text-gray-500 backdrop-blur-sm hover:bg-white"
                                }`}
                            title="开启后在 AI 回合显示落子权重"
                        >
                            🔍
                            <span>{debugMode ? "调试 ON" : "调试"}</span>
                        </button>
                    )}

                    <div ref={menuRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setShowMenu((currentValue) => !currentValue)}
                            className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/90 text-slate-700 shadow-lg backdrop-blur-sm transition hover:bg-white"
                            aria-label={userId ? "打开账户菜单" : "打开登录入口"}
                        >
                            {userId ? (
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-bold text-white">
                                    {(username || "U")[0].toUpperCase()}
                                </span>
                            ) : (
                                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                    <path d="M18 20a6 6 0 0 0-12 0" strokeLinecap="round" />
                                    <circle cx="12" cy="8" r="4" />
                                </svg>
                            )}
                            {userId && !emailVerified && (
                                <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />
                            )}
                        </button>

                        {showMenu && (
                            <div className="absolute right-0 top-full mt-3 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]">
                                <div className="border-b border-slate-100 px-4 py-4">
                                    <div className="text-sm font-semibold text-slate-900">
                                        {userId ? username || "未命名用户" : "账户入口"}
                                    </div>
                                    <div className="mt-1 text-xs leading-5 text-slate-500">
                                        {userId
                                            ? (emailVerified ? "邮箱已验证，可以正常使用账号功能。" : "邮箱尚未验证，部分功能仍会受限。")
                                            : "登录后可以管理资料、安全设置和账号状态。"}
                                    </div>
                                </div>

                                {userId ? (
                                    <div className="py-2">
                                        <Link
                                            href="/account"
                                            onClick={() => setShowMenu(false)}
                                            className="block px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                                        >
                                            账号中心
                                        </Link>
                                        <Link
                                            href="/account#security"
                                            onClick={() => setShowMenu(false)}
                                            className="block px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                                        >
                                            修改密码
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="block w-full px-4 py-2.5 text-left text-sm text-red-500 transition hover:bg-red-50"
                                        >
                                            登出
                                        </button>
                                    </div>
                                ) : (
                                    <div className="py-2">
                                        <Link
                                            href={loginHref}
                                            onClick={() => setShowMenu(false)}
                                            className="block px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
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
        </div>
    );
}

