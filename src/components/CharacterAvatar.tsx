"use client";

import React from "react";
import Image from "next/image";

interface CharacterAvatarProps {
    characterId: string;
    emotion?: "idle" | "think" | "attack" | "happy" | "sad";
    avatarSrc?: string;
    color?: string;
    className?: string;
    size?: "sm" | "md" | "lg";
    // playerColor 取代 emotion 作为右下角指示标
    playerColor?: "black" | "white";
}

const sizeMap = {
    sm: { width: 80, height: 100 },
    md: { width: 120, height: 150 },
    lg: { width: 160, height: 200 },
};

export default function CharacterAvatar({
    characterId,
    emotion = "idle",
    avatarSrc,
    color = "#888",
    className = "",
    size = "md",
    playerColor,
}: CharacterAvatarProps) {
    const { width, height } = sizeMap[size];

    return (
        <div
            className={`relative flex-shrink-0 ${className}`}
            data-character-id={characterId}
            data-emotion={emotion}
            style={{ width, height }}
        >
            {avatarSrc ? (
                <Image
                    src={avatarSrc}
                    alt={characterId}
                    width={width}
                    height={height}
                    className="rounded-xl object-cover w-full h-full shadow-md"
                    style={{
                        filter:
                            emotion === "think"
                                ? "brightness(0.85) saturate(0.8)"
                                : emotion === "sad"
                                    ? "grayscale(0.4) brightness(0.9)"
                                    : emotion === "happy"
                                        ? "brightness(1.1) saturate(1.2)"
                                        : "none",
                        transition: "filter 0.3s ease",
                    }}
                />
            ) : (
                <div
                    className="w-full h-full rounded-xl shadow-md"
                    style={{
                        backgroundColor: color,
                        opacity: emotion === "think" ? 0.7 : emotion === "sad" ? 0.5 : 1,
                        transition: "opacity 0.3s ease",
                    }}
                />
            )}

            {/* 执子颜色指示器（替代原情绪圆点） */}
            {playerColor && (
                <div className="absolute -bottom-1.5 -right-1.5 w-[26px] h-[26px]">
                    <div
                        className={`piece ${playerColor}`}
                        style={{ width: "100%", height: "100%", margin: 0 }}
                    />
                </div>
            )}
        </div>
    );
}
