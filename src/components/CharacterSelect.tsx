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
            <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
                <div className="mb-10 text-center">
                    <h1 className="text-4xl font-extrabold text-gray-800 mb-2 tracking-tight">
                        🎭 Happy！Lucky！黑白棋！
                    </h1>
                    <p className="text-gray-600 text-lg">
                        选择你的执子颜色
                    </p>
                </div>

                <div className="flex gap-6">
                    {/* 黑方按钮 */}
                    <button
                        onClick={() => setPlayerColor("black")}
                        className="group bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 flex flex-col items-center gap-4 border-2 border-transparent hover:border-gray-800 cursor-pointer min-w-[160px]"
                    >
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-700 to-black shadow-lg" />
                        <div className="text-center">
                            <div className="font-bold text-gray-800 text-lg">⬛ 黑方</div>
                            <div className="text-xs text-gray-500 mt-1">先手</div>
                        </div>
                    </button>

                    {/* 白方按钮 */}
                    <button
                        onClick={() => setPlayerColor("white")}
                        className="group bg-white/80 backdrop-blur-sm rounded-2xl p-8 shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 flex flex-col items-center gap-4 border-2 border-transparent hover:border-gray-400 cursor-pointer min-w-[160px]"
                    >
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-white to-gray-200 shadow-lg border-2 border-gray-300" />
                        <div className="text-center">
                            <div className="font-bold text-gray-800 text-lg">⬜ 白方</div>
                            <div className="text-xs text-gray-500 mt-1">后手</div>
                        </div>
                    </button>
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
        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-12">
            {/* Title */}
            <div className="mb-10 text-center">
                <h1 className="text-4xl font-extrabold text-gray-800 mb-2 tracking-tight">
                    🎭 Happy！Lucky！黑白棋！
                </h1>
                <p className="text-gray-600 text-lg">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5 max-w-5xl">
                {availableChars.map((char) => (
                    <button
                        key={char.id}
                        onClick={() => handleSelect(char)}
                        className="group bg-white/80 backdrop-blur-sm rounded-2xl p-5 shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 flex flex-col items-center gap-3 border-2 border-transparent hover:border-blue-400 cursor-pointer"
                    >
                        <CharacterAvatar
                            characterId={char.id}
                            avatarSrc={char.avatar}
                            color={char.color}
                            size="lg"
                            emotion="idle"
                        />
                        <div className="text-center">
                            <div className="font-bold text-gray-800 text-sm">
                                {char.nameJp}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">{char.name}</div>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed text-center mt-1">
                            {char.description}
                        </p>
                        <div className="mt-auto pt-2">
                            <span
                                className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${char.thinkTime === "short"
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
    );
}
