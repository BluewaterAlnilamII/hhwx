"use client";

import React, { useState, useEffect } from "react";
import { buildAuthCallbackUrl, isEmailVerified, readAuthProfileSummary, supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallbackMessage;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loading, setLoading] = useState(false);
    const setAuth = useGameStore((s) => s.setAuth);

    useEffect(() => {
        if (isOpen) {
            setEmail("");
            setPassword("");
            setUsername("");
            setError("");
            setNotice("");
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setNotice("");
        setLoading(true);
        try {
            const { data, error: err } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (err) throw err;

            const summary = await readAuthProfileSummary(data.session);
            if (!summary) {
                throw new Error("登录后未能读取账号信息");
            }

            setAuth({
                userId: summary.userId,
                username: summary.username,
                userEmail: summary.email,
                emailVerified: summary.emailVerified,
            });

            if (!summary.emailVerified) {
                setNotice("当前邮箱尚未验证，部分功能仍会受限。");
            }

            onClose();
        } catch (err: unknown) {
            setError(getErrorMessage(err, "登录失败"));
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setNotice("");
        const normalizedUsername = username.trim();
        if (!normalizedUsername) {
            setError("请输入用户名");
            return;
        }
        setLoading(true);
        try {
            const { data: existingProfile, error: existingProfileError } = await supabase
                .from("profiles")
                .select("id")
                .eq("username", normalizedUsername)
                .maybeSingle();

            if (existingProfileError) {
                throw new Error("检查用户名是否可用失败：" + existingProfileError.message);
            }

            if (existingProfile) {
                setError("该用户名已被占用");
                return;
            }

            const { data, error: err } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: buildAuthCallbackUrl("/account"),
                    data: { username: normalizedUsername },
                },
            });
            if (err) throw err;
            if (data.user) {
                if (data.session && isEmailVerified(data.user)) {
                    const summary = await readAuthProfileSummary(data.session);
                    if (summary) {
                        setAuth({
                            userId: summary.userId,
                            username: summary.username,
                            userEmail: summary.email,
                            emailVerified: summary.emailVerified,
                        });
                        onClose();
                        return;
                    }
                }
            }

            setMode("login");
            setPassword("");
            setNotice("注册成功，请前往邮箱完成验证后再登录。");
        } catch (err: unknown) {
            const message = getErrorMessage(err, "注册失败");
            if (message.includes("Database error saving new user")) {
                setError("注册失败，可能是用户名已被占用或用户资料写入失败，请更换用户名后重试");
                return;
            }

            setError(message);
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

                    {notice && (
                        <div className="mb-4 p-3 bg-blue-50 text-blue-700 text-sm rounded-xl">
                            {notice}
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
