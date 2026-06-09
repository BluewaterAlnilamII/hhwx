"use client";

import React from "react";
import { useTranslations } from "next-intl";

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
    const t = useTranslations("othello.result");
    const playerScore = playerColor === "black" ? blackCount : whiteCount;
    const aiScore = playerColor === "black" ? whiteCount : blackCount;
    const result =
        playerScore > aiScore
            ? t("win")
            : playerScore < aiScore
                ? t("lose")
                : t("draw");

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

                <div className="flex flex-col gap-3 justify-center items-center w-full max-w-xs mx-auto mb-4">
                    <button
                        onClick={onRestart}
                        className="w-full px-6 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition text-sm"
                    >
                        {t("restart")}
                    </button>
                    <button
                        onClick={onReviewBoard}
                        className="w-full px-6 py-2.5 bg-white/10 border border-white/20 text-white font-medium rounded-xl hover:bg-white/20 transition text-sm"
                    >
                        {t("review")}
                    </button>
                    <button
                        onClick={onReturnToSelect}
                        className="w-full px-6 py-2.5 bg-white/10 border border-white/20 text-white font-medium rounded-xl hover:bg-white/20 transition text-sm"
                    >
                        {t("reselect")}
                    </button>
                </div>
            </div>
        </div>
    );
}

