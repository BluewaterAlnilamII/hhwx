"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Languages, Menu, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { buildLocalizedPathname, routing, type AppLocale } from "@/i18n/routing";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { pickGameProfileCardName } from "@/lib/bandori-game-profile-card";
import {
    BANDORI_SERVER_CODES,
    BANDORI_SERVERS,
} from "@/lib/bandori-server";
import { buildAuthPath, clearAuthProfileSummaryCache, getSafeSession, readAuthProfileSummary, supabase } from "@/lib/supabase";
import {
    useBandoriPreferencesStore,
    useBandoriPreferredServer,
} from "@/store/useBandoriPreferencesStore";
import { useAccountProfileStore } from "@/store/useAccountProfileStore";
import { useGameStore } from "@/store/useGameStore";

interface ToolbarProps {
    showDebugButton?: boolean;
    isSidebarOpen?: boolean;
    onToggleSidebar?: () => void;
}

const NOTIFICATIONS_UPDATED_EVENT = "hhwx:notifications-updated";
const toolbarIconButtonClassName = "group relative flex h-9 w-9 items-center justify-center rounded-[15px] border border-white/45 bg-white/22 text-left text-white shadow-[0_6px_16px_rgba(122,61,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:border-white/75 hover:bg-white/34 hover:shadow-[0_10px_24px_rgba(122,61,0,0.22)]";
const toolbarIconInnerClassName = "relative flex h-7 w-7 items-center justify-center rounded-[13px] bg-[#fff4db] text-[#c76400] transition duration-200 group-hover:scale-105 group-hover:bg-[#fff7e7]";
const toolbarMenuClassName = "absolute right-0 top-full mt-3 w-64 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]";

function formatUnreadCount(count: number): string {
    return count > 99 ? "99+" : String(count);
}

function LanguageSwitchIcon() {
    return (
        <span className={toolbarIconInnerClassName}>
            <Languages className="h-4 w-4" aria-hidden="true" />
        </span>
    );
}

interface LanguageMenuContentProps {
    pathname: string;
    currentLocale: AppLocale;
    onSelect: () => void;
}

function LanguageMenuContent({ pathname, currentLocale, onSelect }: LanguageMenuContentProps) {
    const searchParams = useSearchParams();
    const t = useTranslations("navigation.toolbar");
    const languageT = useTranslations("common.language");
    const preferredServer = useBandoriPreferredServer();
    const setPreferredServer = useBandoriPreferencesStore((state) => state.setPreferredServer);
    const [currentHash, setCurrentHash] = useState(() => (
        typeof window === "undefined" ? "" : window.location.hash
    ));
    const queryText = searchParams.toString();
    const languageSuffix = useMemo(() => {
        const querySuffix = queryText ? `?${queryText}` : "";
        return `${querySuffix}${currentHash}`;
    }, [currentHash, queryText]);

    useEffect(() => {
        const updateCurrentHash = () => setCurrentHash(window.location.hash);
        updateCurrentHash();
        window.addEventListener("hashchange", updateCurrentHash);
        return () => window.removeEventListener("hashchange", updateCurrentHash);
    }, []);

    return (
        <div className={toolbarMenuClassName}>
            <div className="border-b border-slate-100 px-5 py-3 text-xs font-semibold text-slate-500">
                {languageT("label")}
            </div>
            <div className="py-2">
                {routing.locales.map((targetLocale) => {
                    const label = languageT(targetLocale);
                    const isCurrentLocale = targetLocale === currentLocale;
                    const languageHref = `${buildLocalizedPathname(pathname, targetLocale)}${languageSuffix}`;

                    if (isCurrentLocale) {
                        return (
                            <div
                                key={targetLocale}
                                className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-slate-900"
                                aria-current="true"
                            >
                                <span>{label}</span>
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span className="sr-only">{t("currentLanguage")}</span>
                                </span>
                            </div>
                        );
                    }

                    return (
                        <a
                            key={targetLocale}
                            href={languageHref}
                            onClick={onSelect}
                            className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            aria-label={t("switchLanguage", { language: label })}
                        >
                            <span>{label}</span>
                        </a>
                    );
                })}
            </div>
            <div className="border-t border-slate-100 px-5 py-3">
                <div className="mb-2 text-xs font-semibold text-slate-500">
                    {currentLocale === "en" ? "Preferred server" : "首选服务器"}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                    {BANDORI_SERVERS.map((server) => {
                        const label = BANDORI_SERVER_CODES[server].toUpperCase();
                        const selected = server === preferredServer;
                        return (
                            <button
                                key={server}
                                type="button"
                                onClick={() => setPreferredServer(server)}
                                aria-pressed={selected}
                                className={`rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                                    selected
                                        ? "bg-sky-100 text-sky-700"
                                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function LanguageMenuLoading() {
    const languageT = useTranslations("common.language");

    return (
        <div className={toolbarMenuClassName}>
            <div className="border-b border-slate-100 px-5 py-3 text-xs font-semibold text-slate-500">
                {languageT("label")}
            </div>
        </div>
    );
}

export default function Toolbar({ showDebugButton = true, isSidebarOpen = false, onToggleSidebar }: ToolbarProps) {
    const pathname = usePathname();
    const locale = useLocale() as AppLocale;
    const t = useTranslations("navigation.toolbar");
    const languageT = useTranslations("common.language");
    const preferredServer = useBandoriPreferredServer();
    const { userId, username, emailVerified, setAuth, logout, debugMode, toggleDebugMode } = useGameStore();
    const [showMenu, setShowMenu] = useState(false);
    const [showLanguageMenu, setShowLanguageMenu] = useState(false);
    const [notificationUnreadState, setNotificationUnreadState] = useState<{ userId: string; unreadCount: number } | null>(null);
    const storedProfileUserId = useAccountProfileStore((state) => state.userId);
    const storedProfile = useAccountProfileStore((state) => state.profile);
    const loadAccountProfile = useAccountProfileStore((state) => state.loadProfile);
    const clearAccountProfile = useAccountProfileStore((state) => state.clearProfile);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const languageMenuRef = useRef<HTMLDivElement | null>(null);
    const unreadRequestRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
    const returnPath = pathname && !pathname.startsWith("/auth") ? pathname : "/account";
    const loginHref = buildAuthPath("login", returnPath, undefined, locale);
    const currentLanguageLabel = languageT(locale);
    const shouldShowDebugButton = showDebugButton && pathname === "/";
    const toolbarProfile = storedProfileUserId === userId ? storedProfile : null;
    const toolbarUsername = toolbarProfile?.username ?? username;
    const avatarCardId = toolbarProfile?.avatarCardId ?? null;
    const avatarCardServer = toolbarProfile?.avatarCardServer ?? null;
    const notificationUnreadCount = notificationUnreadState?.userId === userId ? notificationUnreadState.unreadCount : 0;
    const notificationBadgeLabel = notificationUnreadCount > 0 ? formatUnreadCount(notificationUnreadCount) : null;
    const { data: cardMetadata } = useBandoriCardsMaster(
        avatarCardServer ?? undefined,
        Boolean(userId && avatarCardId),
    );
    const selectedCardMetadata = avatarCardId
        ? cardMetadata?.[String(avatarCardId)]
        : null;
    const selectedCardDisplayName = avatarCardId
        ? pickGameProfileCardName(
            avatarCardId,
            selectedCardMetadata ?? undefined,
            preferredServer,
            locale,
        )
        : null;

    useEffect(() => {
        let disposed = false;

        const applyAuthSummary = async (
            session: Parameters<typeof readAuthProfileSummary>[0],
            options?: { forceRefresh?: boolean },
        ) => {
            try {
                const summary = await readAuthProfileSummary(session, options);
                if (disposed) {
                    return;
                }

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
            } catch (error) {
                console.error("Failed to restore auth summary:", error);
                if (
                    !disposed
                    && useGameStore.getState().userId !== session?.user.id
                ) {
                    logout();
                }
            }
        };

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT") {
                clearAuthProfileSummaryCache();
                clearAccountProfile();
                setNotificationUnreadState(null);
                logout();
                return;
            }

            if (!session) {
                clearAccountProfile();
                setNotificationUnreadState(null);
                logout();
                return;
            }

            if (event === "TOKEN_REFRESHED") {
                return;
            }

            if (
                event === "SIGNED_IN"
                && useGameStore.getState().userId === session.user.id
            ) {
                return;
            }

            void applyAuthSummary(session, {
                forceRefresh: event === "USER_UPDATED",
            });
        });

        return () => {
            disposed = true;
            subscription.unsubscribe();
        };
    }, [clearAccountProfile, setAuth, logout]);

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

    useEffect(() => {
        if (!showLanguageMenu) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (languageMenuRef.current && !languageMenuRef.current.contains(event.target as Node)) {
                setShowLanguageMenu(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [showLanguageMenu]);

    const loadToolbarProfile = useCallback(async () => {
        if (!userId) {
            return;
        }

        try {
            await loadAccountProfile(userId);
        } catch (error) {
            console.error("Toolbar profile request failed:", error);
        }
    }, [loadAccountProfile, userId]);

    const loadNotificationUnreadCount = useCallback((): Promise<void> => {
        if (!userId) {
            return Promise.resolve();
        }
        if (unreadRequestRef.current?.userId === userId) {
            return unreadRequestRef.current.promise;
        }

        const currentUserId = userId;
        const promise = (async () => {
            const session = await getSafeSession();
            if (!session?.access_token) {
                return;
            }

            const response = await fetch("/api/account/notifications/unread-count", {
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                },
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                if (response.status !== 401) {
                    console.error(
                        "Toolbar unread count request failed:",
                        getApiErrorMessage(payload) || `HTTP ${response.status}`,
                    );
                }
                return;
            }

            const unread = parseApiSuccessData<{ unreadCount: number }>(payload);
            if (unread) {
                if (useGameStore.getState().userId !== currentUserId) {
                    return;
                }
                setNotificationUnreadState({
                    userId: currentUserId,
                    unreadCount: unread.unreadCount,
                });
            }
        })().finally(() => {
            if (unreadRequestRef.current?.promise === promise) {
                unreadRequestRef.current = null;
            }
        });
        unreadRequestRef.current = { userId: currentUserId, promise };
        return promise;
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            void loadToolbarProfile();
            void loadNotificationUnreadCount();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [loadNotificationUnreadCount, loadToolbarProfile, userId]);

    useEffect(() => {
        if (!userId || !showMenu) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            void loadNotificationUnreadCount();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [loadNotificationUnreadCount, showMenu, userId]);

    useEffect(() => {
        if (!userId) {
            return;
        }

        const handleNotificationsUpdated = () => {
            void loadNotificationUnreadCount();
        };

        window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
        return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
    }, [loadNotificationUnreadCount, userId]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        clearAuthProfileSummaryCache();
        clearAccountProfile();
        setNotificationUnreadState(null);
        logout();
        setShowMenu(false);
    };

    const toggleLanguageMenu = () => {
        setShowLanguageMenu((currentValue) => !currentValue);
        setShowMenu(false);
    };

    const toggleAccountMenu = () => {
        setShowMenu((currentValue) => !currentValue);
        setShowLanguageMenu(false);
    };

    return (
        <header className="sticky top-0 z-[250] border-b border-white/85 bg-[#FF9922] shadow-[0_10px_24px_rgba(255,153,34,0.28)]">
            <div className="flex h-[58px] w-full items-center justify-between gap-2 px-3 sm:px-4 lg:justify-end lg:px-5">
                <div className="lg:hidden">
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        className="group relative flex h-8 w-8 items-center justify-center rounded-[14px] border border-white/45 bg-white/22 text-left shadow-[0_6px_16px_rgba(122,61,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:border-white/75 hover:bg-white/34 hover:shadow-[0_10px_24px_rgba(122,61,0,0.22)]"
                        aria-label={isSidebarOpen ? t("closeNavigation") : t("openNavigation")}
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
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-[14px] border transition duration-200 ${debugMode
                                    ? "border-white/80 bg-white text-[#c76400] shadow-[0_8px_20px_rgba(122,61,0,0.2)]"
                                    : "border-white/45 bg-white/22 text-white shadow-[0_6px_16px_rgba(122,61,0,0.14)] hover:-translate-y-0.5 hover:scale-[1.03] hover:border-white/70 hover:bg-white/34 hover:shadow-[0_10px_24px_rgba(122,61,0,0.2)]"
                                }`}
                            title={t("debugTitle")}
                            aria-label={debugMode ? t("disableDebug") : t("enableDebug")}
                        >
                            <span aria-hidden="true">🔍</span>
                        </button>
                    )}

                    <div ref={languageMenuRef} className="relative">
                        <button
                            type="button"
                            onClick={toggleLanguageMenu}
                            className={toolbarIconButtonClassName}
                            title={currentLanguageLabel}
                            aria-label={t("openLanguageMenu")}
                            aria-expanded={showLanguageMenu}
                            aria-haspopup="menu"
                        >
                            <LanguageSwitchIcon />
                        </button>

                        {showLanguageMenu && (
                            <Suspense fallback={<LanguageMenuLoading />}>
                                <LanguageMenuContent
                                    pathname={pathname}
                                    currentLocale={locale}
                                    onSelect={() => setShowLanguageMenu(false)}
                                />
                            </Suspense>
                        )}
                    </div>

                    <div ref={menuRef} className="relative">
                        <button
                            type="button"
                            onClick={toggleAccountMenu}
                            className={toolbarIconButtonClassName}
                            aria-label={userId ? t("openAccountMenu") : t("openLogin")}
                            aria-expanded={showMenu}
                            aria-haspopup="menu"
                        >
                            <span className={toolbarIconInnerClassName}>
                                {userId ? (
                                    <AccountCardAvatar
                                        username={toolbarUsername}
                                        cardId={avatarCardId}
                                        entityServer={avatarCardServer}
                                        trainType={toolbarProfile?.avatarCardTrainType}
                                        resourceSetName={selectedCardMetadata?.resourceSetName}
                                        displayName={selectedCardDisplayName}
                                        size="toolbar"
                                        className="shadow-none ring-1 ring-white/80"
                                    />
                                ) : (
                                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                        <path d="M18 20a6 6 0 0 0-12 0" strokeLinecap="round" />
                                        <circle cx="12" cy="8" r="4" />
                                    </svg>
                                )}
                                {userId && !emailVerified && (
                                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-300 ring-2 ring-[#FF9922]" />
                                )}
                                {notificationBadgeLabel ? (
                                    <span className="absolute -left-2 -top-2 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-[#FF9922]">
                                        {notificationBadgeLabel}
                                    </span>
                                ) : null}
                            </span>
                        </button>

                        {showMenu && (
                            <div className={toolbarMenuClassName}>
                                {userId ? (
                                    <div className="py-2">
                                        <Link
                                            href="/account"
                                            onClick={() => setShowMenu(false)}
                                            className="block px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                        >
                                            {emailVerified ? t("accountCenter") : t("accountCenterUnverified")}
                                        </Link>
                                        <Link
                                            href="/account/notifications"
                                            onClick={() => setShowMenu(false)}
                                            className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                        >
                                            <span>{t("notifications")}</span>
                                            {notificationBadgeLabel ? (
                                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white">
                                                    {notificationBadgeLabel}
                                                </span>
                                            ) : null}
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="block w-full px-5 py-3 text-left text-sm font-medium text-red-500 transition hover:bg-red-50"
                                        >
                                            {t("logout")}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="py-2">
                                        <Link
                                            href={loginHref}
                                            onClick={() => setShowMenu(false)}
                                            className="block px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                        >
                                            {t("login")}
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

