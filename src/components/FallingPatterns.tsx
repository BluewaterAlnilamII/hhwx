"use client";

import React, { useState, useEffect } from "react";

export default function FallingPatterns() {
    const [items, setItems] = useState<
        { id: number; left: number; delay: number; duration: number; size: number }[]
    >([]);

    useEffect(() => {
        setItems(
            Array.from({ length: 20 }, (_, i) => ({
                id: i,
                left: Math.random() * 100,
                delay: -(Math.random() * 20), // 负延迟使动画从中途开始，避免初始时屏幕空白
                duration: 8 + Math.random() * 7,
                size: 24 + Math.random() * 20,
            }))
        );
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
