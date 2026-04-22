"use client";

import React, { useState, useEffect } from "react";
import FallingPatterns from "@/components/FallingPatterns";
import CharacterSelect from "@/components/CharacterSelect";
import GamePage from "@/components/GamePage";
import { useGameStore } from "@/store/useGameStore";
import { getSavedGame, type SavedGameData } from "@/hooks/useOthelloGame";
import { getCharacterById } from "@/lib/characters";
import { countPieces } from "@/lib/othello";

export default function Home() {
  const { selectionStep, setCharactersById } = useGameStore();
  const isGameReady = selectionStep === "ready";

  const [savedGame, setSavedGame] = useState<SavedGameData | null>(null);
  const showResume = savedGame !== null;

  // 页面挂载时检查是否有已保存的对局数据
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

  // 提取续局对话框的展示信息
  const playerCharInfo = savedGame?.playerCharacterId
    ? getCharacterById(savedGame.playerCharacterId)
    : null;
  const aiCharInfo = savedGame?.aiCharacterId
    ? getCharacterById(savedGame.aiCharacterId)
    : null;
  const savedPieces = savedGame?.board ? countPieces(savedGame.board) : null;

  return (
    <main className="relative min-h-screen">
      <FallingPatterns />

      {/* 续局对话框 */}
      {showResume && savedGame && (
        <div className="resume-overlay">
          <div className="resume-panel">
            <h2 className="text-2xl font-extrabold mb-4">🎮 是否继续上轮棋局？</h2>

            {playerCharInfo && aiCharInfo && (
              <div className="flex justify-center gap-6 mb-4">
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto rounded-full overflow-hidden border-2 mb-1"
                    style={{ borderColor: playerCharInfo.color }}>
                    <img
                      src={playerCharInfo.avatar}
                      alt={playerCharInfo.nameJp}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-sm font-bold text-blue-300">你</div>
                  <div className="text-xs text-gray-300">{playerCharInfo.nameJp}</div>
                </div>
                <div className="self-center text-gray-400 text-lg font-light">VS</div>
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto rounded-full overflow-hidden border-2 mb-1"
                    style={{ borderColor: aiCharInfo.color }}>
                    <img
                      src={aiCharInfo.avatar}
                      alt={aiCharInfo.nameJp}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-sm font-bold text-red-300">对手</div>
                  <div className="text-xs text-gray-300">{aiCharInfo.nameJp}</div>
                </div>
              </div>
            )}

            {savedPieces && (
              <div className="flex justify-center gap-6 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-gray-700 to-black" />
                  <span className="text-lg font-bold text-white">{savedPieces.black}</span>
                </div>
                <span className="text-gray-400 font-light">:</span>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-white to-gray-200 border border-gray-400" />
                  <span className="text-lg font-bold text-white">{savedPieces.white}</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={handleResume}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition text-sm"
              >
                ✅ 是，继续
              </button>
              <button
                onClick={handleDecline}
                className="px-6 py-2.5 bg-white/10 border border-white/20 text-white font-medium rounded-xl hover:bg-white/20 transition text-sm"
              >
                ❌ 否，重新开始
              </button>
            </div>
          </div>
        </div>
      )}

      {!showResume && (isGameReady ? <GamePage /> : <CharacterSelect />)}
    </main>
  );
}
