import { createClient, type Session, type User } from "@supabase/supabase-js";

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

export function isEmailVerified(user: Pick<User, "email_confirmed_at"> | null | undefined): boolean {
	return Boolean(user?.email_confirmed_at);
}

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

export async function readAuthProfileSummary(session?: Session | null): Promise<AuthProfileSummary | null> {
	const activeSession = session ?? await getSafeSession();
	const user = activeSession?.user;

	if (!user) {
		return null;
	}

	const fallbackUsername = readUserMetadataUsername(user);

	return {
		userId: user.id,
		username: await readUsername(user.id, fallbackUsername),
		email: user.email ?? null,
		emailVerified: isEmailVerified(user),
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
