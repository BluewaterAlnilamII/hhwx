"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Languages, Menu, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { buildLocalizedPathname, routing, type AppLocale } from "@/i18n/routing";
import { type AccountAvatarCardTrainType } from "@/lib/account-avatar-defaults";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { buildAuthPath, clearAuthProfileSummaryCache, getSafeSession, readAuthProfileSummary, supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

interface ToolbarProps {
    showDebugButton?: boolean;
    isSidebarOpen?: boolean;
    onToggleSidebar?: () => void;
}

type ToolbarAccountProfile = {
    userId: string;
    username: string;
    avatarCardId: number;
    avatarCardTrainType: AccountAvatarCardTrainType;
};

type CardMetadataResponse = {
    cards?: Record<string, {
        displayName?: string | null;
        resourceSetName?: string;
        assetRegion?: BandoriAssetRegion;
    }>;
};

const NOTIFICATIONS_UPDATED_EVENT = "hhwx:notifications-updated";
const toolbarIconButtonClassName = "group relative flex h-9 w-9 items-center justify-center rounded-[15px] border border-white/45 bg-white/22 text-left text-white shadow-[0_6px_16px_rgba(122,61,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:border-white/75 hover:bg-white/34 hover:shadow-[0_10px_24px_rgba(122,61,0,0.22)]";
const toolbarIconInnerClassName = "relative flex h-7 w-7 items-center justify-center rounded-[13px] bg-[#fff4db] text-[#c76400] transition duration-200 group-hover:scale-105 group-hover:bg-[#fff7e7]";
const toolbarMenuClassName = "absolute right-0 top-full mt-3 w-64 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]";

function transformCardMetadata(raw: unknown): CardMetadataResponse {
    return parseApiSuccessData<CardMetadataResponse>(raw) ?? {};
}

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
    const { userId, username, emailVerified, setAuth, logout, debugMode, toggleDebugMode } = useGameStore();
    const [showMenu, setShowMenu] = useState(false);
    const [showLanguageMenu, setShowLanguageMenu] = useState(false);
    const [toolbarProfileState, setToolbarProfileState] = useState<{ userId: string; profile: ToolbarAccountProfile } | null>(null);
    const [notificationUnreadState, setNotificationUnreadState] = useState<{ userId: string; unreadCount: number } | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const languageMenuRef = useRef<HTMLDivElement | null>(null);
    const returnPath = pathname && !pathname.startsWith("/auth") ? pathname : "/account";
    const loginHref = buildAuthPath("login", returnPath, undefined, locale);
    const currentLanguageLabel = languageT(locale);
    const shouldShowDebugButton = showDebugButton && pathname === "/";
    const toolbarProfile = toolbarProfileState?.userId === userId ? toolbarProfileState.profile : null;
    const toolbarUsername = toolbarProfile?.username ?? username;
    const avatarCardId = toolbarProfile?.avatarCardId ?? null;
    const notificationUnreadCount = notificationUnreadState?.userId === userId ? notificationUnreadState.unreadCount : 0;
    const notificationBadgeLabel = notificationUnreadCount > 0 ? formatUnreadCount(notificationUnreadCount) : null;
    const cardMetadataUrl = userId && avatarCardId ? `/api/bandori/cards?ids=${avatarCardId}` : null;
    const { data: cardMetadata } = useCachedFetch(
        userId && avatarCardId ? `toolbar-account-avatar-card-v1-${avatarCardId}` : null,
        cardMetadataUrl,
        transformCardMetadata,
        { staleTimeMs: 86400000 },
    );
    const selectedCardMetadata = avatarCardId ? cardMetadata?.cards?.[String(avatarCardId)] : null;

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
                if (!disposed) {
                    logout();
                }
            }
        };

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT") {
                clearAuthProfileSummaryCache();
                logout();
                return;
            }

            if (!session) {
                logout();
                return;
            }

            if (event === "TOKEN_REFRESHED") {
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

    const loadAccountHeaderData = useCallback(async () => {
        if (!userId) {
            return;
        }

        const currentUserId = userId;
        const session = await getSafeSession();
        if (!session?.access_token) {
            return;
        }

        const headers = {
            Authorization: `Bearer ${session.access_token}`,
        };

        const [profileResponse, unreadResponse] = await Promise.all([
            fetch("/api/account/profile", { headers }),
            fetch("/api/account/notifications/unread-count", { headers }),
        ]);

        if (profileResponse.ok) {
            const profilePayload = await profileResponse.json().catch(() => ({}));
            const profile = parseApiSuccessData<ToolbarAccountProfile>(profilePayload);
            if (profile) {
                setToolbarProfileState({
                    userId: currentUserId,
                    profile,
                });
            }
        } else if (profileResponse.status !== 401) {
            const payload = await profileResponse.json().catch(() => ({}));
            console.error("Toolbar profile request failed:", getApiErrorMessage(payload) || `HTTP ${profileResponse.status}`);
        }

        if (unreadResponse.ok) {
            const unreadPayload = await unreadResponse.json().catch(() => ({}));
            const unread = parseApiSuccessData<{ unreadCount: number }>(unreadPayload);
            if (unread) {
                setNotificationUnreadState({
                    userId: currentUserId,
                    unreadCount: unread.unreadCount,
                });
            }
        } else if (unreadResponse.status !== 401) {
            const payload = await unreadResponse.json().catch(() => ({}));
            console.error("Toolbar unread count request failed:", getApiErrorMessage(payload) || `HTTP ${unreadResponse.status}`);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            void loadAccountHeaderData();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [loadAccountHeaderData, pathname, userId]);

    useEffect(() => {
        if (!userId || !showMenu) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            void loadAccountHeaderData();
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [loadAccountHeaderData, showMenu, userId]);

    useEffect(() => {
        if (!userId) {
            return;
        }

        const handleNotificationsUpdated = () => {
            void loadAccountHeaderData();
        };

        window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
        return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, handleNotificationsUpdated);
    }, [loadAccountHeaderData, userId]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        clearAuthProfileSummaryCache();
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
                                        trainType={toolbarProfile?.avatarCardTrainType}
                                        resourceSetName={selectedCardMetadata?.resourceSetName}
                                        displayName={selectedCardMetadata?.displayName}
                                        assetRegion={selectedCardMetadata?.assetRegion}
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

