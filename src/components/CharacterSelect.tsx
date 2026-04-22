"use client";

import React from "react";
import { CHARACTERS, Character } from "@/lib/characters";
import { useGameStore } from "@/store/useGameStore";
import CharacterAvatar from "./CharacterAvatar";

export default function CharacterSelect() {
    const {
        playerCharacter,
        selectionStep,
        setPlayerCharacter,
        setAICharacter,
        setPlayerColor,
    } = useGameStore();

    const isPickingAI = selectionStep === "pickAI";
    const isPickingColor = selectionStep === "pickColor";

    // 选色界面
    if (isPickingColor) {
        return (
            <div className="relative z-10 flex h-full items-center justify-center px-4 py-0">
                <div className="flex w-full max-w-3xl flex-col items-center lg:-translate-y-[6vh]">
                    <div className="mb-8 text-center">
                        <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-gray-800">
                            🎭 Happy！Lucky！黑白棋！
                        </h1>
                        <p className="text-lg text-gray-600">
                            选择你的执子颜色
                        </p>
                    </div>

                    <div className="flex gap-6">
                        {/* 黑方按钮 */}
                        <button
                            onClick={() => setPlayerColor("black")}
                            className="group flex min-w-[160px] flex-col items-center gap-4 rounded-2xl border-2 border-transparent bg-white/80 p-8 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-gray-800 hover:shadow-2xl"
                        >
                            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-gray-700 to-black shadow-lg" />
                            <div className="text-center">
                                <div className="text-lg font-bold text-gray-800">⬛ 黑方</div>
                                <div className="mt-1 text-xs text-gray-500">先手</div>
                            </div>
                        </button>

                        {/* 白方按钮 */}
                        <button
                            onClick={() => setPlayerColor("white")}
                            className="group flex min-w-[160px] flex-col items-center gap-4 rounded-2xl border-2 border-transparent bg-white/80 p-8 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-gray-400 hover:shadow-2xl"
                        >
                            <div className="h-16 w-16 rounded-full border-2 border-gray-300 bg-gradient-to-br from-white to-gray-200 shadow-lg" />
                            <div className="text-center">
                                <div className="text-lg font-bold text-gray-800">⬜ 白方</div>
                                <div className="mt-1 text-xs text-gray-500">后手</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const availableChars = isPickingAI
        ? CHARACTERS.filter((c) => c.id !== playerCharacter?.id)
        : CHARACTERS;

    const handleSelect = (char: Character) => {
        if (isPickingAI) {
            setAICharacter(char);
        } else {
            setPlayerCharacter(char);
        }
    };

    return (
        <div className="relative z-10 flex h-full items-center justify-center px-4 py-0">
            <div className="flex w-full max-w-5xl flex-col items-center lg:-translate-y-[6vh]">
                {/* Title */}
                <div className="mb-7 text-center lg:mb-7">
                    <h1 className="mb-2 text-4xl font-extrabold tracking-tight text-gray-800">
                        🎭 Happy！Lucky！黑白棋！
                    </h1>
                    <p className="text-lg text-gray-600">
                        {isPickingAI
                            ? "选择你的对手"
                            : "选择你的角色"}
                    </p>
                    {isPickingAI && playerCharacter && (
                        <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-500">
                            <span>你选择了</span>
                            <span className="font-bold text-gray-700">
                                {playerCharacter.nameJp}
                            </span>
                        </div>
                    )}
                </div>

                {/* Character grid */}
                <div className="grid max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-5">
                    {availableChars.map((char) => (
                        <button
                            key={char.id}
                            onClick={() => handleSelect(char)}
                            className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-transparent bg-white/80 p-4 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:border-blue-400 hover:shadow-2xl lg:p-5"
                        >
                            <CharacterAvatar
                                characterId={char.id}
                                avatarSrc={char.avatar}
                                color={char.color}
                                size="lg"
                                emotion="idle"
                            />
                            <div className="text-center">
                                <div className="text-sm font-bold text-gray-800">
                                    {char.nameJp}
                                </div>
                                <div className="mt-0.5 text-xs text-gray-400">{char.name}</div>
                            </div>
                            <p className="mt-1 text-center text-xs leading-relaxed text-gray-500">
                                {char.description}
                            </p>
                            <div className="mt-auto pt-2">
                                <span
                                    className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${char.thinkTime === "short"
                                        ? "bg-green-100 text-green-700"
                                        : char.thinkTime === "medium"
                                            ? "bg-yellow-100 text-yellow-700"
                                            : "bg-red-100 text-red-700"
                                        }`}
                                >
                                    思考: {char.thinkTime === "short" ? "快" : char.thinkTime === "medium" ? "中" : "慢"}
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
