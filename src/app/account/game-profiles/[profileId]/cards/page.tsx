"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  decodeCompressedGameProfilePayload,
  getGameProfileCards,
  type CompressedGameProfilePayload,
  type UserGameProfileCardRecord,
} from "@/lib/user-game-profile-payload";
import { isLocalGameProfileId, readLocalGameProfilePayload } from "@/lib/user-game-profile-local-store";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "@/app/account/AccountShell";
import { getAccessToken, useAccountProfile } from "@/app/account/useAccountProfile";

async function requestCards(profileId: string): Promise<UserGameProfileCardRecord[]> {
  if (isLocalGameProfileId(profileId)) {
    return getGameProfileCards(await readLocalGameProfilePayload(profileId));
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("请先登录");
  }

  const response = await fetch(`/api/account/game-profiles/${profileId}/payload`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) || `请求失败（HTTP ${response.status}）`);
  }

  const compressed = parseApiSuccessData<CompressedGameProfilePayload>(payload);
  if (!compressed) {
    return [];
  }

  return getGameProfileCards(await decodeCompressedGameProfilePayload(compressed));
}

export default function GameProfileCardsPage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = use(params);
  const { userId, authReady, loadingProfile, profileError } = useAccountProfile();
  const [cards, setCards] = useState<UserGameProfileCardRecord[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profileId || !userId) {
      return;
    }

    let canceled = false;
    async function loadCards() {
      try {
        const nextCards = await requestCards(profileId);
        if (!canceled) {
          setCards(nextCards);
          setError("");
        }
      } catch (loadError) {
        if (!canceled) {
          setError(loadError instanceof Error ? loadError.message : "读取卡牌失败");
        }
      } finally {
        if (!canceled) {
          setLoadingCards(false);
        }
      }
    }

    void loadCards();
    return () => {
      canceled = true;
    };
  }, [profileId, userId]);

  return (
    <AccountShell title="Profile 卡牌" description="查看当前 Profile 的卡牌数据。" backHref="/account" backLabel="返回账号中心">
      {!authReady || loadingProfile ? (
        <AccountLoadingState message="正在读取账号信息..." />
      ) : !userId ? (
        <AccountSignInState nextPath={`/account/game-profiles/${profileId}/cards`} />
      ) : profileError || error ? (
        <AccountErrorState message={profileError || error} />
      ) : loadingCards ? (
        <AccountLoadingState message="正在读取卡牌..." />
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900">卡牌</h2>
            <Link href="/account" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-600">
              Profile 管理
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">共 {cards.length} 张卡牌</p>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-semibold">卡牌 ID</th>
                  <th className="py-2 pr-4 font-semibold">等级</th>
                  <th className="py-2 pr-4 font-semibold">星光等级</th>
                  <th className="py-2 pr-4 font-semibold">技能等级</th>
                  <th className="py-2 pr-4 font-semibold">小故事</th>
                  <th className="py-2 pr-4 font-semibold">特训</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cards.map((card) => (
                  <tr key={card.cardId}>
                    <td className="py-2 pr-4 font-semibold text-slate-900">{card.cardId}</td>
                    <td className="py-2 pr-4">{card.level}</td>
                    <td className="py-2 pr-4">{card.masterRank}</td>
                    <td className="py-2 pr-4">{card.skillLevel}</td>
                    <td className="py-2 pr-4">{card.episodeCount}</td>
                    <td className="py-2 pr-4">{card.isTrained ? "已特训" : "未特训"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AccountShell>
  );
}
