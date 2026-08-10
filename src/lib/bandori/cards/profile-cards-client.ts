import { getApiErrorCode, getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";

type GameProfileCardsPatchResult = {
  sectionVersions: {
    cardsHash: string;
  };
};

export class UserGameProfileCardsPatchError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

export async function patchUserGameProfileCards({
  profileId,
  cards,
  baseCardsHash,
  accessToken,
  saveFailedMessage,
  invalidResponseMessage,
  fetcher = fetch,
}: {
  profileId: string;
  cards: UserGameProfileCardRecord[];
  baseCardsHash: string;
  accessToken: string;
  saveFailedMessage: (status: number) => string;
  invalidResponseMessage: string;
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): Promise<string> {
  const response = await fetcher(`/api/account/game-profiles/${profileId}/cards`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ baseCardsHash, cards }),
  });
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new UserGameProfileCardsPatchError(
      getApiErrorMessage(responsePayload) || saveFailedMessage(response.status),
      getApiErrorCode(responsePayload),
    );
  }
  const data = parseApiSuccessData<GameProfileCardsPatchResult>(responsePayload);
  if (!data) throw new UserGameProfileCardsPatchError(invalidResponseMessage, null);
  return data.sectionVersions.cardsHash;
}
