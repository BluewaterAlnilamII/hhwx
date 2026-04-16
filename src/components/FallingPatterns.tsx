"use client";

import React, { useState, useEffect } from "react";

export default function FallingPatterns() {
    const [items, setItems] = useState<
        { id: number; left: number; delay: number; duration: number; size: number }[]
    >([]);

    useEffect(() => {
        const frameId = window.requestAnimationFrame(() => {
            setItems(
                // 元素数量从 20 减至 12：每个飘落图片各占一个 GPU 合成层，
                // 层数越少合成开销越低；12 个在视觉上仍能保持足够的密度感。
                Array.from({ length: 12 }, (_, i) => ({
                    id: i,
                    left: Math.random() * 100,
                    delay: -(Math.random() * 20), // 负延迟使动画从中途开始，避免初始时屏幕空白
                    duration: 8 + Math.random() * 7,
                    size: 24 + Math.random() * 20,
                }))
            );
        });

        return () => window.cancelAnimationFrame(frameId);
    }, []);

    return (
        <div className="falling-pattern">
            {items.map((item) => (
                <img
                    key={item.id}
                    src="/res/band_3.svg"
                    alt=""
                    className="falling-disc"
                    style={{
                        left: `${item.left}%`,
                        width: item.size,
                        height: item.size,
                        animationDuration: `${item.duration}s`,
                        animationDelay: `${item.delay}s`,
                    }}
                />
            ))}
        </div>
    );
}
