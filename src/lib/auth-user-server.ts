import { ApiRouteError } from "@/lib/api-contracts";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const USERS_PER_PAGE = 200;

export interface AuthUserSummary {
  id: string;
  email: string | null;
}

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

export async function findAuthUserByEmail(email: string): Promise<AuthUserSummary | null> {
  const normalizedEmail = normalizeEmailAddress(email);
  if (!normalizedEmail) {
    return null;
  }

  const serviceClient = createServerSupabaseClient();
  let page = 1;

  while (true) {
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) {
      throw new ApiRouteError(500, "AUTH_USER_LOOKUP_FAILED", "检查邮箱是否可用失败", error.message);
    }

    const matchedUser = data.users.find((user) => normalizeEmailAddress(user.email ?? "") === normalizedEmail);
    if (matchedUser) {
      return {
        id: matchedUser.id,
        email: matchedUser.email ?? null,
      };
    }

    if (!data.nextPage || data.users.length === 0 || page >= data.lastPage) {
      return null;
    }

    page = data.nextPage;
  }
}