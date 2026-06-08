import { createClient, type Session } from "@supabase/supabase-js";
import { parseApiSuccessData } from "@/lib/api-contracts";
import {
	buildLocalizedPathname,
	DEFAULT_LOCALE,
	getLocaleFromPathname,
	isSupportedLocale,
	stripLocalePrefix,
	type AppLocale,
} from "@/i18n/routing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const DEFAULT_SITE_URL = "http://localhost:3000";
const AUTH_SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

export interface AuthProfileSummary {
	userId: string;
	username: string;
	email: string | null;
	emailVerified: boolean;
}

type AuthSummaryCacheEntry = {
	userId: string;
	value: AuthProfileSummary;
	updatedAt: number;
};

type AuthSummaryRequestEntry = {
	userId: string;
	forceRefresh: boolean;
	promise: Promise<AuthProfileSummary | null>;
};

export type AuthViewMode = "login" | "register" | "forgot-password";
export type AuthFlashNotice = "signup-email-sent";

let authSummaryCache: AuthSummaryCacheEntry | null = null;
let authSummaryRequestInFlight: AuthSummaryRequestEntry | null = null;
let authSummaryRequestGeneration = 0;

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

export function normalizeInternalPath(path: string | null | undefined, fallback = "/"): string {
	if (!path || !path.startsWith("/") || path.startsWith("//")) {
		return fallback;
	}

	return stripLocalePrefix(path);
}

export function normalizeAuthMode(mode: string | null | undefined, fallback: AuthViewMode = "login"): AuthViewMode {
	if (mode === "register" || mode === "forgot-password" || mode === "login") {
		return mode;
	}

	return fallback;
}

export function getSiteUrl(): string {
	const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
	if (configured) {
		const withScheme = configured.startsWith("http") ? configured : `https://${configured}`;
		return trimTrailingSlash(withScheme);
	}

	if (typeof window !== "undefined") {
		return trimTrailingSlash(window.location.origin);
	}

	return DEFAULT_SITE_URL;
}

function resolveCurrentLocale(locale?: AppLocale | string | null): AppLocale | undefined {
	if (isSupportedLocale(locale)) {
		return locale;
	}

	if (typeof window === "undefined") {
		return undefined;
	}

	return getLocaleFromPathname(window.location.pathname) ?? undefined;
}

export function buildAuthCallbackUrl(nextPath = "/account", locale?: AppLocale | string | null): string {
	const resolvedLocale = resolveCurrentLocale(locale);
	const authCallbackPath = buildLocalizedPathname("/auth/confirm", resolvedLocale ?? DEFAULT_LOCALE);
	const url = new URL(authCallbackPath, getSiteUrl());
	const safeNextPath = normalizeInternalPath(nextPath, "/account");
	url.searchParams.set("next", safeNextPath);
	return url.toString();
}

export function buildEmailVerificationCallbackUrl(nextPath = "/account/email", locale?: AppLocale | string | null): string {
	const url = new URL(buildAuthCallbackUrl(nextPath, locale));
	url.searchParams.set("verify_email", "1");
	return url.toString();
}

export function buildAuthPath(
	mode: AuthViewMode = "login",
	nextPath = "/account",
	notice?: AuthFlashNotice,
	locale?: AppLocale | string | null,
): string {
	const safeNextPath = normalizeInternalPath(nextPath, "/account");
	const params = new URLSearchParams({
		mode,
		next: safeNextPath,
	});

	if (notice) {
		params.set("notice", notice);
	}

	const resolvedLocale = resolveCurrentLocale(locale);
	const authPath = buildLocalizedPathname("/auth", resolvedLocale ?? DEFAULT_LOCALE);
	return `${authPath}?${params.toString()}`;
}

function readCachedAuthSummary(userId: string): AuthProfileSummary | null {
	if (!authSummaryCache || authSummaryCache.userId !== userId) {
		return null;
	}

	if (Date.now() - authSummaryCache.updatedAt >= AUTH_SUMMARY_CACHE_TTL_MS) {
		return null;
	}

	return authSummaryCache.value;
}

export function clearAuthProfileSummaryCache(): void {
	authSummaryCache = null;
	authSummaryRequestInFlight = null;
	authSummaryRequestGeneration += 1;
}

export async function readAuthProfileSummary(
	session?: Session | null,
	options?: { forceRefresh?: boolean },
): Promise<AuthProfileSummary | null> {
	const activeSession = session ?? await getSafeSession();
	const user = activeSession?.user;

	if (!user) {
		clearAuthProfileSummaryCache();
		return null;
	}

	if (!options?.forceRefresh) {
		const cachedSummary = readCachedAuthSummary(user.id);
		if (cachedSummary) {
			return cachedSummary;
		}
	}

	const forceRefresh = options?.forceRefresh === true;
	if (
		authSummaryRequestInFlight?.userId === user.id
		&& (!forceRefresh || authSummaryRequestInFlight.forceRefresh)
	) {
		return authSummaryRequestInFlight.promise;
	}

	const requestGeneration = authSummaryRequestGeneration + 1;
	authSummaryRequestGeneration = requestGeneration;
	const requestPromise = fetch("/api/account/auth-summary", {
		headers: {
			Authorization: `Bearer ${activeSession.access_token}`,
		},
	})
		.then(async (response) => {
			if (response.status === 401) {
				clearAuthProfileSummaryCache();
				return null;
			}

			if (!response.ok) {
				throw new Error(`Auth summary request failed: HTTP ${response.status}`);
			}

			const summary = parseApiSuccessData<AuthProfileSummary>(await response.json());
			if (!summary) {
				throw new Error("Auth summary response is invalid");
			}

			if (authSummaryRequestGeneration !== requestGeneration) {
				return readCachedAuthSummary(summary.userId);
			}

			authSummaryCache = {
				userId: summary.userId,
				value: summary,
				updatedAt: Date.now(),
			};

			return summary;
		})
		.finally(() => {
			if (authSummaryRequestInFlight?.promise === requestPromise) {
				authSummaryRequestInFlight = null;
			}
		});

	authSummaryRequestInFlight = {
		userId: user.id,
		forceRefresh,
		promise: requestPromise,
	};

	return requestPromise;
}

function isInvalidRefreshTokenError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	return message.includes("invalid refresh token") || message.includes("refresh token not found");
}

export async function getSafeSession() {
	try {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		return session;
	} catch (error) {
		if (isInvalidRefreshTokenError(error)) {
			await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
			return null;
		}

		throw error;
	}
}
