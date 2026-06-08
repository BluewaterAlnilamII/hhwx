"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import FallingPatterns from "@/components/FallingPatterns";
import CharacterSelect from "@/components/CharacterSelect";
import GamePage from "@/components/GamePage";
import { useGameStore } from "@/store/useGameStore";
import { getSavedGame, type SavedGameData } from "@/hooks/useOthelloGame";
import { getCharacterById } from "@/lib/characters";
import { countPieces } from "@/lib/othello";

export default function Home() {
  const t = useTranslations("othello.resume");
  const { selectionStep, setCharactersById } = useGameStore();
  const isGameReady = selectionStep === "ready";

  const [savedGame, setSavedGame] = useState<SavedGameData | null>(null);
  const showResume = savedGame !== null;

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const saved = getSavedGame();
      if (saved && saved.playerCharacterId && saved.aiCharacterId) {
        setSavedGame(saved);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  const handleResume = () => {
    if (savedGame && savedGame.playerCharacterId && savedGame.aiCharacterId) {
      setCharactersById(savedGame.playerCharacterId, savedGame.aiCharacterId);
    }
    setSavedGame(null);
  };

  const handleDecline = () => {
    localStorage.removeItem("hhwx-othello-game");
    setSavedGame(null);
  };

  const playerCharInfo = savedGame?.playerCharacterId
    ? getCharacterById(savedGame.playerCharacterId)
    : null;
  const aiCharInfo = savedGame?.aiCharacterId
    ? getCharacterById(savedGame.aiCharacterId)
    : null;
  const savedPieces = savedGame?.board ? countPieces(savedGame.board) : null;

  return (
    <main className="relative h-full">
      <FallingPatterns />

      {showResume && savedGame && (
        <div className="resume-overlay">
          <div className="resume-panel">
            <h2 className="mb-4 text-2xl font-extrabold">{t("title")}</h2>

            {playerCharInfo && aiCharInfo && (
              <div className="mb-4 flex justify-center gap-6">
                <div className="text-center">
                  <div className="mx-auto mb-1 h-14 w-14 overflow-hidden rounded-full border-2"
                    style={{ borderColor: playerCharInfo.color }}>
                    <img
                      src={playerCharInfo.avatar}
                      alt={playerCharInfo.nameJp}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="text-sm font-bold text-blue-300">{t("you")}</div>
                  <div className="text-xs text-gray-300">{playerCharInfo.nameJp}</div>
                </div>
                <div className="self-center text-lg font-light text-gray-400">VS</div>
                <div className="text-center">
                  <div className="mx-auto mb-1 h-14 w-14 overflow-hidden rounded-full border-2"
                    style={{ borderColor: aiCharInfo.color }}>
                    <img
                      src={aiCharInfo.avatar}
                      alt={aiCharInfo.nameJp}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="text-sm font-bold text-red-300">{t("opponent")}</div>
                  <div className="text-xs text-gray-300">{aiCharInfo.nameJp}</div>
                </div>
              </div>
            )}

            {savedPieces && (
              <div className="mb-6 flex justify-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-gradient-to-br from-gray-700 to-black" />
                  <span className="text-lg font-bold text-white">{savedPieces.black}</span>
                </div>
                <span className="font-light text-gray-400">:</span>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full border border-gray-400 bg-gradient-to-br from-white to-gray-200" />
                  <span className="text-lg font-bold text-white">{savedPieces.white}</span>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3">
              <button
                onClick={handleResume}
                className="rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                {t("accept")}
              </button>
              <button
                onClick={handleDecline}
                className="rounded-xl border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-white/20"
              >
                {t("decline")}
              </button>
            </div>
          </div>
        </div>
      )}

      {!showResume && (isGameReady ? <GamePage /> : <CharacterSelect />)}
    </main>
  );
}
