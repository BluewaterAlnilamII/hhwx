"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import LoadingIndicator, { LoadingSpinner } from "@/components/LoadingIndicator";
import { useLocale, useTranslations } from "next-intl";
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

export default function GuestbookCommentSection() {
    const t = useTranslations("othello.comments");
    const locale = useLocale();
    const commonT = useTranslations("common");
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [loadingComments, setLoadingComments] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const readSequence = useRef(0);
    const { userId, username, emailVerified, authReady } = useGameStore();

    const fetchComments = useCallback(async () => {
        const sequence = ++readSequence.current;
        setLoadingComments(true);
        setLoadFailed(false);
        try {
            const { data, error } = await supabase
                .from("guestbook_comments")
                .select("id, content, created_at, profiles(username)")
                .order("created_at", { ascending: false })
                .limit(50);
            if (error) throw error;
            if (sequence === readSequence.current) setComments((data ?? []) as unknown as Comment[]);
        } catch {
            if (sequence === readSequence.current) setLoadFailed(true);
        } finally {
            if (sequence === readSequence.current) setLoadingComments(false);
        }
    }, []);

    useEffect(() => {
        fetchComments();
        return () => { readSequence.current += 1; };
    }, [fetchComments]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !userId || !emailVerified) return;
        setLoading(true);
        setSubmitError("");
        try {
            const session = await getSafeSession();
            if (!session?.access_token) {
                setSubmitError(t("loginError"));
                return;
            }

            const response = await fetch("/api/guestbook-comments", {
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
                setSubmitError(getApiErrorMessage(payload) || t("httpSubmitFailed", { status: response.status }));
                return;
            }

            setNewComment("");
            setSubmitError("");
            fetchComments();
        } catch (err: unknown) {
            console.error("Failed to post comment:", err);
            setSubmitError(getErrorMessage(err, t("submitFailed")));
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString(locale, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    return (
        <div className="w-full max-w-2xl mx-auto mt-8 mb-12 px-4">
            <h3 className="text-lg font-bold text-[var(--theme-color-text-default)] mb-4">{t("title")}</h3>

            {/* Comment input */}
            {!authReady ? (
                <div className="mb-6 p-4 bg-[var(--theme-color-panel-background)] rounded-xl text-center text-[var(--theme-color-text-muted)] text-sm">
                    <LoadingIndicator compact label={t("loadingAuth")} />
                </div>
            ) : userId ? (
                emailVerified ? (
                <form onSubmit={handleSubmit} className="mb-6">
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-1 bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-action-accent-foreground)]">
                            {getUsernameAvatarLabel(username)}
                        </div>
                        <div className="flex-1">
                            <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder={t("placeholder")}
                                className="hhwx-control w-full px-4 py-3 rounded-xl border transition resize-none text-sm"
                                rows={2}
                            />
                            <div className="flex justify-end mt-2">
                                <button
                                    type="submit"
                                    disabled={loading || !newComment.trim()}
                                    className="px-5 py-1.5 text-sm font-medium rounded-full hover:opacity-90 transition disabled:opacity-40 bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-action-accent-foreground)]"
                                >
                                    {loading ? <LoadingSpinner className="mr-2 align-middle text-current" /> : null}
                                    {loading ? t("submitting") : t("submit")}
                                </button>
                            </div>
                            {submitError && (
                                <div className="mt-2 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{submitError}</div>
                            )}
                        </div>
                    </div>
                </form>
                ) : (
                    <div className="mb-6 p-4 bg-[var(--theme-color-semantic-warning-background)] rounded-xl text-center text-[var(--theme-color-semantic-warning-foreground)] text-sm">
                        {t("verifyRequired")}
                    </div>
                )
            ) : (
                <div className="mb-6 p-4 bg-[var(--theme-color-panel-background)] rounded-xl text-center text-[var(--theme-color-text-muted)] text-sm">
                    {t("loginRequired")}
                </div>
            )}

            {/* Comment list */}
            <div className="space-y-3">
                {loadFailed ? <div role="alert" className="text-sm text-[var(--theme-color-semantic-danger-foreground)]">{commonT("states.loadFailed")} <button type="button" className="hhwx-text-link" onClick={() => void fetchComments()}>{commonT("actions.retry")}</button></div> : null}
                {loadingComments && comments.length === 0 ? <LoadingIndicator label={commonT("states.loading")} className="min-h-32" /> : null}
                {!loadingComments && !loadFailed && comments.length === 0 && (
                    <div className="text-center text-[var(--theme-color-text-muted)] text-sm py-8">
                        {t("empty")}
                    </div>
                )}
                {comments.map((c) => (
                    <div
                        key={c.id}
                        className="bg-[var(--theme-color-panel-background)] rounded-xl p-4 shadow-xs"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-[var(--theme-color-action-accent-background)] text-[var(--theme-color-action-accent-foreground)]">
                                {getUsernameAvatarLabel(c.profiles?.username, "?")}
                            </div>
                            <span className="text-sm font-semibold text-[var(--theme-color-text-default)]">
                                {c.profiles?.username || t("anonymous")}
                            </span>
                            <span className="text-xs text-[var(--theme-color-text-muted)] ml-auto">
                                {formatTime(c.created_at)}
                            </span>
                        </div>
                        <p className="text-sm text-[var(--theme-color-text-muted)] leading-relaxed">{c.content}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
