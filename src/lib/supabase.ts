import { createClient, type Session, type User } from "@supabase/supabase-js";
import { ACCOUNT_STATUS_TABLE } from "@/lib/supabase-table-names";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const DEFAULT_SITE_URL = "http://localhost:3000";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

export interface AuthProfileSummary {
	userId: string;
	username: string;
	email: string | null;
	emailVerified: boolean;
}

export type AuthViewMode = "login" | "register" | "forgot-password";
export type AuthFlashNotice = "signup-email-sent";

function readUserMetadataUsername(user: Pick<User, "user_metadata"> | null | undefined): string | null {
	const username = typeof user?.user_metadata?.username === "string"
		? user.user_metadata.username.trim()
		: "";

	return username || null;
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

export function normalizeInternalPath(path: string | null | undefined, fallback = "/"): string {
	if (!path || !path.startsWith("/") || path.startsWith("//")) {
		return fallback;
	}

	return path;
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

export function buildAuthCallbackUrl(nextPath = "/account"): string {
	const url = new URL("/auth/confirm", getSiteUrl());
	const safeNextPath = normalizeInternalPath(nextPath, "/account");
	url.searchParams.set("next", safeNextPath);
	return url.toString();
}

export function buildEmailVerificationCallbackUrl(nextPath = "/account/email"): string {
	const url = new URL(buildAuthCallbackUrl(nextPath));
	url.searchParams.set("verify_email", "1");
	return url.toString();
}

export function buildAuthPath(mode: AuthViewMode = "login", nextPath = "/account", notice?: AuthFlashNotice): string {
	const safeNextPath = normalizeInternalPath(nextPath, "/account");
	const params = new URLSearchParams({
		mode,
		next: safeNextPath,
	});

	if (notice) {
		params.set("notice", notice);
	}

	return `/auth?${params.toString()}`;
}

async function readUsername(userId: string, fallbackUsername: string | null = null): Promise<string> {
	const { data, error } = await supabase
		.from("profiles")
		.select("username")
		.eq("id", userId)
		.maybeSingle();

	if (error) {
		throw error;
	}

	return data?.username ?? fallbackUsername ?? "User";
}

async function readEmailVerified(userId: string): Promise<boolean> {
	const { data, error } = await supabase
		.from(ACCOUNT_STATUS_TABLE)
		.select("email_verified_at")
		.eq("user_id", userId)
		.maybeSingle();

	if (error) {
		throw error;
	}

	return Boolean(data?.email_verified_at);
}

export async function readAuthProfileSummary(session?: Session | null): Promise<AuthProfileSummary | null> {
	const activeSession = session ?? await getSafeSession();
	const user = activeSession?.user;

	if (!user) {
		return null;
	}

	const fallbackUsername = readUserMetadataUsername(user);
	const [username, emailVerified] = await Promise.all([
		readUsername(user.id, fallbackUsername),
		readEmailVerified(user.id),
	]);

	return {
		userId: user.id,
		username,
		email: user.email ?? null,
		emailVerified,
	};
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
