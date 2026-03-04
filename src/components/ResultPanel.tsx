"use client";

import React from "react";

interface ResultPanelProps {
    blackCount: number;
    whiteCount: number;
    playerColor: "black" | "white";
    playerName: string;
    aiName: string;
    onRestart: () => void;
    onReturnToSelect: () => void;
    onReviewBoard: () => void;
}

export default function ResultPanel({
    blackCount,
    whiteCount,
    playerColor,
    playerName,
    aiName,
    onRestart,
    onReturnToSelect,
    onReviewBoard,
}: ResultPanelProps) {
    const playerScore = playerColor === "black" ? blackCount : whiteCount;
    const aiScore = playerColor === "black" ? whiteCount : blackCount;
    const result =
        playerScore > aiScore
            ? "🎉 你赢了！"
            : playerScore < aiScore
                ? "😢 你输了…"
                : "🤝 平局！";

    return (
        <div className="result-overlay">
            <div className="result-panel">
                <h2 className="text-3xl font-extrabold mb-6">{result}</h2>

                <div className="flex justify-center gap-8 mb-8">
                    <div className="text-center">
                        <div className="text-sm text-gray-400 mb-1">{playerName}</div>
                        <div className="text-4xl font-bold text-blue-400">{playerScore}</div>
                    </div>
                    <div className="text-gray-500 text-2xl font-light self-end mb-1">:</div>
                    <div className="text-center">
                        <div className="text-sm text-gray-400 mb-1">{aiName}</div>
                        <div className="text-4xl font-bold text-red-400">{aiScore}</div>
                    </div>
                </div>

                <div className="flex gap-3 justify-center flex-wrap">
                    <button
                        onClick={onRestart}
                        className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition text-sm"
                    >
                        重新开始
                    </button>
                    <button
                        onClick={onReviewBoard}
                        className="px-6 py-2.5 bg-white/10 border border-white/20 text-white font-medium rounded-xl hover:bg-white/20 transition text-sm"
                    >
                        📋 回看棋盘
                    </button>
                    <button
                        onClick={onReturnToSelect}
                        className="px-6 py-2.5 bg-white/10 border border-white/20 text-white font-medium rounded-xl hover:bg-white/20 transition text-sm"
                    >
                        返回选角
                    </button>
                </div>
            </div>
        </div>
    );
}

