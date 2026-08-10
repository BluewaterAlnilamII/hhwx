"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Languages, Menu, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import ToolbarMusicPlayer from "@/components/music-player/ToolbarMusicPlayer";
import {
    toolbarIconButtonClassName,
    toolbarIconInnerClassName,
    toolbarMenuClassName,
} from "@/components/toolbar/toolbar-styles";
import { useBandoriCardsMaster } from "@/hooks/useBandoriCardsMaster";
import { buildLocalizedPathname, routing, type AppLocale } from "@/i18n/routing";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { pickGameProfileCardName } from "@/lib/bandori/cards/game-profile-card";
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
type OpenToolbarMenu = "player" | "language" | "account" | null;

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
            <div className="border-b border-[var(--theme-color-border-subtle)] px-5 py-3 text-xs font-semibold text-[var(--theme-color-text-muted)]">
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
                                className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-[var(--theme-color-text-default)]"
                                aria-current="true"
                            >
                                <span>{label}</span>
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--theme-color-menu-item-indicator-background-current)] text-[var(--theme-color-menu-item-indicator-foreground-current)]">
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
                            className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-[var(--theme-color-text-default)] transition hover:bg-[var(--theme-color-control-background-hover)]"
                            aria-label={t("switchLanguage", { language: label })}
                        >
                            <span>{label}</span>
                        </a>
                    );
                })}
            </div>
            <div className="border-t border-[var(--theme-color-border-subtle)] px-5 py-3">
                <div className="mb-2 text-xs font-semibold text-[var(--theme-color-text-muted)]">
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
                                        ? "bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-control-foreground-pressed)]"
                                        : "bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)]"
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
            <div className="border-b border-[var(--theme-color-border-subtle)] px-5 py-3 text-xs font-semibold text-[var(--theme-color-text-muted)]">
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
    const [toolbarMenuState, setToolbarMenuState] = useState<{
        pathname: string;
        menu: OpenToolbarMenu;
    }>(() => ({ pathname, menu: null }));
    const [notificationUnreadState, setNotificationUnreadState] = useState<{ userId: string; unreadCount: number } | null>(null);
    const storedProfileUserId = useAccountProfileStore((state) => state.userId);
    const storedProfile = useAccountProfileStore((state) => state.profile);
    const loadAccountProfile = useAccountProfileStore((state) => state.loadProfile);
    const clearAccountProfile = useAccountProfileStore((state) => state.clearProfile);
    const toolbarMenusRef = useRef<HTMLDivElement | null>(null);
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
    const openToolbarMenu = toolbarMenuState.pathname === pathname ? toolbarMenuState.menu : null;
    const setOpenToolbarMenu = useCallback((nextValue: React.SetStateAction<OpenToolbarMenu>) => {
        setToolbarMenuState((currentState) => {
            const currentMenu = currentState.pathname === pathname ? currentState.menu : null;
            return {
                pathname,
                menu: typeof nextValue === "function" ? nextValue(currentMenu) : nextValue,
            };
        });
    }, [pathname]);
    const showMenu = openToolbarMenu === "account";
    const showLanguageMenu = openToolbarMenu === "language";
    const showPlayerMenu = openToolbarMenu === "player";
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
        if (!openToolbarMenu) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (toolbarMenusRef.current && !toolbarMenusRef.current.contains(event.target as Node)) {
                setOpenToolbarMenu(null);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpenToolbarMenu(null);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [openToolbarMenu, setOpenToolbarMenu]);

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
        setOpenToolbarMenu(null);
    };

    const toggleLanguageMenu = () => {
        setOpenToolbarMenu((currentValue) => currentValue === "language" ? null : "language");
    };

    const toggleAccountMenu = () => {
        setOpenToolbarMenu((currentValue) => currentValue === "account" ? null : "account");
    };

    return (
        <header className="sticky top-0 z-250 border-b border-[var(--theme-color-shell-header-border)] bg-[var(--theme-color-shell-header-background)] text-[var(--theme-color-toolbar-foreground)] shadow-[var(--theme-shadow-toolbar-header)]">
            <div className="flex h-[58px] w-full items-center justify-between gap-2 px-3 sm:px-4 lg:justify-end lg:px-5">
                <div className="lg:hidden">
                    <button
                        type="button"
                        onClick={onToggleSidebar}
                        className="group relative flex h-8 w-8 items-center justify-center rounded-[14px] border border-[var(--theme-color-toolbar-control-border)] bg-[var(--theme-color-toolbar-control-background)] text-left shadow-[var(--theme-shadow-toolbar-control)] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-[var(--theme-color-toolbar-control-background-hover)] hover:shadow-[var(--theme-shadow-toolbar-control-hover)]"
                        aria-label={isSidebarOpen ? t("closeNavigation") : t("openNavigation")}
                    >
                        <span className="relative flex h-6 w-6 items-center justify-center rounded-[12px] bg-[var(--theme-color-toolbar-control-icon-background)] text-[var(--theme-color-toolbar-control-icon-foreground)] transition duration-200 group-hover:scale-105 group-hover:bg-[var(--theme-color-toolbar-control-icon-background-hover)]">
                            {isSidebarOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
                        </span>
                    </button>
                </div>

                <div ref={toolbarMenusRef} className="flex items-center gap-2.5">
                    {shouldShowDebugButton && (
                        <button
                            onClick={toggleDebugMode}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-[14px] border transition duration-200 ${debugMode
                                    ? "border-[var(--theme-color-toolbar-control-border)] bg-[var(--theme-color-toolbar-control-icon-background)] text-[var(--theme-color-toolbar-control-icon-foreground)] shadow-[var(--theme-shadow-toolbar-control-selected)]"
                                    : "border-[var(--theme-color-toolbar-control-border)] bg-[var(--theme-color-toolbar-control-background)] text-[var(--theme-color-toolbar-control-foreground)] shadow-[var(--theme-shadow-toolbar-control)] hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-[var(--theme-color-toolbar-control-background-hover)] hover:shadow-[var(--theme-shadow-toolbar-control-hover)]"
                                }`}
                            title={t("debugTitle")}
                            aria-label={debugMode ? t("disableDebug") : t("enableDebug")}
                        >
                            <span aria-hidden="true">🔍</span>
                        </button>
                    )}

                    <ToolbarMusicPlayer
                        isOpen={showPlayerMenu}
                        onToggle={() => setOpenToolbarMenu((currentValue) => currentValue === "player" ? null : "player")}
                        onRequestClose={() => setOpenToolbarMenu((currentValue) => currentValue === "player" ? null : currentValue)}
                    />

                    <div className="relative">
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
                                    onSelect={() => setOpenToolbarMenu(null)}
                                />
                            </Suspense>
                        )}
                    </div>

                    <div className="relative">
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
                                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[var(--theme-color-status-warning-indicator)] ring-2 ring-[var(--theme-color-notification-badge-ring)]" />
                                )}
                                {notificationBadgeLabel ? (
                                    <span className="absolute -left-2 -top-2 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--theme-color-notification-badge-background)] px-1 text-[10px] font-bold leading-none text-[var(--theme-color-notification-badge-foreground)] shadow-xs ring-2 ring-[var(--theme-color-notification-badge-ring)]">
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
                                            onClick={() => setOpenToolbarMenu(null)}
                                            className="block px-5 py-3 text-sm font-medium text-[var(--theme-color-text-default)] transition hover:bg-[var(--theme-color-control-background-hover)]"
                                        >
                                            {emailVerified ? t("accountCenter") : t("accountCenterUnverified")}
                                        </Link>
                                        <Link
                                            href="/account/notifications"
                                            onClick={() => setOpenToolbarMenu(null)}
                                            className="flex items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-[var(--theme-color-text-default)] transition hover:bg-[var(--theme-color-control-background-hover)]"
                                        >
                                            <span>{t("notifications")}</span>
                                            {notificationBadgeLabel ? (
                                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--theme-color-notification-badge-background)] px-1.5 text-[11px] font-bold leading-none text-[var(--theme-color-notification-badge-foreground)]">
                                                    {notificationBadgeLabel}
                                                </span>
                                            ) : null}
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="block w-full px-5 py-3 text-left text-sm font-medium text-[var(--theme-color-action-destructive-foreground)] transition hover:bg-[var(--theme-color-action-destructive-background-hover)]"
                                        >
                                            {t("logout")}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="py-2">
                                        <Link
                                            href={loginHref}
                                            onClick={() => setOpenToolbarMenu(null)}
                                            className="block px-5 py-3 text-sm font-medium text-[var(--theme-color-text-default)] transition hover:bg-[var(--theme-color-control-background-hover)]"
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

