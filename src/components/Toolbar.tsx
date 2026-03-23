"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";
import AuthModal from "./AuthModal";

interface ToolbarProps {
    showDebugButton?: boolean;
}

export default function Toolbar({ showDebugButton = true }: ToolbarProps) {
    const { userId, username, setAuth, logout, debugMode, toggleDebugMode } = useGameStore();
    const [showAuth, setShowAuth] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    // Restore session on mount
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                supabase
                    .from("profiles")
                    .select("username")
                    .eq("id", session.user.id)
                    .single()
                    .then(({ data }) => {
                        setAuth(session.user.id, data?.username ?? "User");
                    });
            }
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                logout();
            }
        });

        return () => subscription.unsubscribe();
    }, [setAuth, logout]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        logout();
        setShowMenu(false);
    };

    return (
        <>
            <div className="fixed top-4 right-4 z-[250] flex items-center gap-3">
                {showDebugButton && (
                    <button
                        onClick={toggleDebugMode}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transition-all duration-200 ${debugMode
                                ? "bg-cyan-500 text-white shadow-cyan-500/30"
                                : "bg-white/70 backdrop-blur-sm text-gray-500 hover:bg-white/90"
                            }`}
                        title="开启后在 AI 回合显示落子权重"
                    >
                        🔍
                        <span>{debugMode ? "调试 ON" : "调试"}</span>
                    </button>
                )}

                {userId ? (
                    <div className="relative">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg hover:bg-white transition font-medium text-gray-700"
                        >
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                {(username || "U")[0].toUpperCase()}
                            </div>
                            <span className="text-sm">{username}</span>
                        </button>
                        {showMenu && (
                            <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl py-2 min-w-[140px]">
                                <button
                                    onClick={handleLogout}
                                    className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition"
                                >
                                    登出
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => setShowAuth(true)}
                        className="bg-white/90 backdrop-blur-sm px-5 py-2 rounded-full shadow-lg hover:bg-white transition font-semibold text-gray-700 text-sm"
                    >
                        登录 / 注册
                    </button>
                )}
            </div>

            <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
        </>
    );
}

