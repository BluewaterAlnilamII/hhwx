import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabasePublishableKey);

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
