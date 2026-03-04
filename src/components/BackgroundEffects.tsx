'use client';

import React, { useEffect, useRef } from 'react';

export default function BackgroundEffects() {
    const glowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let animationFrameId: number;

        const handleMouseMove = (e: MouseEvent) => {
            // 使用 requestAnimationFrame 优化性能，直接修改 DOM 以避免 React 整体重渲染
            cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(() => {
                if (glowRef.current) {
                    glowRef.current.style.transform = `translate(${e.clientX - 200}px, ${e.clientY - 200}px)`;
                }
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            {/* Scheme 2: Parallax Pattern (base layer - very transparent dots) */}
            <div className="absolute inset-0 opacity-[0.08] bg-[radial-gradient(#000_2px,transparent_2px)] [background-size:40px_40px] animate-parallax-bg" />

            {/* Scheme 1: Dynamic Fluid Gradients (middle layer) */}
            <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-[#ff6b6b]/30 rounded-full blur-[120px] animate-blob mix-blend-multiply" />
            <div className="absolute top-[20%] right-[-10%] w-[50vw] h-[70vw] max-w-[700px] max-h-[900px] bg-[#fca311]/30 rounded-full blur-[100px] animate-blob animation-delay-2000 mix-blend-multiply" />
            <div className="absolute bottom-[-20%] left-[20%] w-[70vw] h-[60vw] max-w-[900px] max-h-[800px] bg-white/60 rounded-full blur-[120px] animate-blob animation-delay-4000" />

            {/* Scheme 4: Interactive Mouse Glow (top layer) */}
            <div
                ref={glowRef}
                className="absolute w-[400px] h-[400px] bg-white/60 rounded-full blur-[100px] transition-transform duration-75 ease-out will-change-transform mix-blend-overlay"
                style={{
                    transform: `translate(-1000px, -1000px)`, // 初始藏在屏幕外
                }}
            />
        </div>
    );
}
