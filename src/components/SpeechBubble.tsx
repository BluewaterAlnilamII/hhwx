"use client";

import React from "react";

interface SpeechBubbleProps {
    text: string;
    visible: boolean;
    position: "left" | "right";
    className?: string;
}

export default function SpeechBubble({
    text,
    visible,
    position,
    className = "",
}: SpeechBubbleProps) {
    if (!visible && !text) return null;

    return (
        <div
            className={`
        speech-bubble
        ${!visible ? "hiding" : ""}
        relative inline-block max-w-[220px] px-4 py-3 rounded-2xl
        text-sm font-medium leading-snug
        bg-white text-gray-800
        shadow-lg
        z-50
        ${className}
      `}
            style={{
                borderBottomLeftRadius: position === "left" ? "4px" : undefined,
                borderBottomRightRadius: position === "right" ? "4px" : undefined,
            }}
        >
            {text}
            {/* Tail */}
            <div
                className="absolute bottom-0 w-3 h-3 bg-white"
                style={{
                    [position === "left" ? "left" : "right"]: "12px",
                    transform: "translateY(40%) rotate(45deg)",
                }}
            />
        </div>
    );
}
