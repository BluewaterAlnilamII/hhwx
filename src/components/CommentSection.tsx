"use client";

import React, { useState, useEffect, useCallback } from "react";
import { getApiErrorMessage } from "@/lib/api-contracts";
import { getUsernameAvatarLabel } from "@/lib/username-policy";
import { getSafeSession, supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

interface Comment {
    id: string;
    content: string;
    created_at: string;
    profiles: { username: string } | null;
}

function getErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return fallbackMessage;
}

export default function CommentSection() {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const { userId, username, emailVerified, authReady } = useGameStore();

    const fetchComments = useCallback(async () => {
        const { data } = await supabase
            .from("comments")
            .select("id, content, created_at, profiles(username)")
            .order("created_at", { ascending: false })
            .limit(50);
        if (data) setComments(data as unknown as Comment[]);
    }, []);

    useEffect(() => {
        fetchComments();
    }, [fetchComments]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !userId || !emailVerified) return;
        setLoading(true);
        setSubmitError("");
        try {
            const session = await getSafeSession();
            if (!session?.access_token) {
                setSubmitError("请先登录");
                return;
            }

            const response = await fetch("/api/comments", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    content: newComment.trim(),
                }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setSubmitError(getApiErrorMessage(payload) || `评论发送失败（HTTP ${response.status}）`);
                return;
            }

            setNewComment("");
            setSubmitError("");
            fetchComments();
        } catch (err: unknown) {
            console.error("Failed to post comment:", err);
            setSubmitError(getErrorMessage(err, "评论发送失败"));
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString("zh-CN", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    return (
        <div className="w-full max-w-2xl mx-auto mt-8 mb-12 px-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">💬 游戏评论区</h3>

            {/* Comment input */}
            {!authReady ? (
                <div className="mb-6 p-4 bg-white/60 backdrop-blur-sm rounded-xl text-center text-gray-500 text-sm">
                    正在读取登录状态...
                </div>
            ) : userId ? (
                emailVerified ? (
                <form onSubmit={handleSubmit} className="mb-6">
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1">
                            {getUsernameAvatarLabel(username)}
                        </div>
                        <div className="flex-1">
                            <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="说点什么吧..."
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 outline-none transition resize-none text-gray-800 bg-white/80 backdrop-blur-sm text-sm"
                                rows={2}
                            />
                            <div className="flex justify-end mt-2">
                                <button
                                    type="submit"
                                    disabled={loading || !newComment.trim()}
                                    className="px-5 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium rounded-full hover:opacity-90 transition disabled:opacity-40"
                                >
                                    {loading ? "发送中..." : "发送"}
                                </button>
                            </div>
                            {submitError && (
                                <div className="mt-2 text-sm text-red-500">{submitError}</div>
                            )}
                        </div>
                    </div>
                </form>
                ) : (
                    <div className="mb-6 p-4 bg-amber-50 rounded-xl text-center text-amber-700 text-sm">
                        请先完成邮箱验证后再发表评论
                    </div>
                )
            ) : (
                <div className="mb-6 p-4 bg-white/60 backdrop-blur-sm rounded-xl text-center text-gray-500 text-sm">
                    请先登录后发表评论
                </div>
            )}

            {/* Comment list */}
            <div className="space-y-3">
                {comments.length === 0 && (
                    <div className="text-center text-gray-400 text-sm py-8">
                        暂无评论，来说点什么吧！
                    </div>
                )}
                {comments.map((c) => (
                    <div
                        key={c.id}
                        className="bg-white/70 backdrop-blur-sm rounded-xl p-4 shadow-sm"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center text-white text-[10px] font-bold">
                                {getUsernameAvatarLabel(c.profiles?.username, "?")}
                            </div>
                            <span className="text-sm font-semibold text-gray-700">
                                {c.profiles?.username || "匿名"}
                            </span>
                            <span className="text-xs text-gray-400 ml-auto">
                                {formatTime(c.created_at)}
                            </span>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed">{c.content}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
