"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const setAuth = useGameStore((s) => s.setAuth);

    useEffect(() => {
        if (isOpen) {
            setEmail("");
            setPassword("");
            setUsername("");
            setError("");
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            const { data, error: err } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (err) throw err;
            // Fetch username from profiles
            const { data: profile } = await supabase
                .from("profiles")
                .select("username")
                .eq("id", data.user.id)
                .single();
            setAuth(data.user.id, profile?.username ?? "User");
            onClose();
        } catch (err: any) {
            setError(err.message || "登录失败");
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!username.trim()) {
            setError("请输入用户名");
            return;
        }
        setLoading(true);
        try {
            const { data, error: err } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { username: username.trim() },
                },
            });
            if (err) throw err;
            if (data.user) {
                // 主动在 profiles 表创建记录（作为数据库触发器的补充/双保险）
                const { error: profileErr } = await supabase.from("profiles").upsert({
                    id: data.user.id,
                    username: username.trim(),
                });
                if (profileErr) throw new Error("创建用户资料失败：" + profileErr.message);

                setAuth(data.user.id, username.trim());
            }
            onClose();
        } catch (err: any) {
            setError(err.message || "注册失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[300]">
            <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
                {/* Tab header */}
                <div className="flex mb-6 border-b border-gray-200">
                    <button
                        className={`flex-1 pb-3 text-center font-semibold transition-colors ${mode === "login"
                            ? "text-blue-600 border-b-2 border-blue-600"
                            : "text-gray-400 hover:text-gray-600"
                            }`}
                        onClick={() => setMode("login")}
                    >
                        登录
                    </button>
                    <button
                        className={`flex-1 pb-3 text-center font-semibold transition-colors ${mode === "register"
                            ? "text-blue-600 border-b-2 border-blue-600"
                            : "text-gray-400 hover:text-gray-600"
                            }`}
                        onClick={() => setMode("register")}
                    >
                        注册
                    </button>
                </div>

                <form onSubmit={mode === "login" ? handleLogin : handleRegister}>
                    {mode === "register" && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                用户名
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition text-gray-800"
                                placeholder="输入你的用户名"
                                required
                            />
                        </div>
                    )}

                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            邮箱
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition text-gray-800"
                            placeholder="输入邮箱"
                            required
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            密码
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition text-gray-800"
                            placeholder="输入密码"
                            required
                            minLength={6}
                        />
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50"
                    >
                        {loading ? "处理中..." : mode === "login" ? "登录" : "注册"}
                    </button>
                </form>

                <button
                    onClick={onClose}
                    className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600 transition"
                >
                    关闭
                </button>
            </div>
        </div>
    );
}
