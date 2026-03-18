'use client';

import React from 'react';

export default function BackgroundEffects() {
    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            {/*
              基础点阵层（最底层）
              使用 transform: translate 驱动视差，而非修改 backgroundPosition。
              backgroundPosition 动画无法走 GPU 合成路径，每帧都会触发重绘；
              改为 transform 后浏览器可直接在合成线程完成动画，主线程零开销。
              元素向四周各扩展 40px（等于一个 background-size 周期），
              配合父容器 overflow-hidden，确保 transform 平移时边缘不露白。
            */}
            <div className="absolute -inset-[40px] opacity-[0.08] bg-[radial-gradient(#000_2px,transparent_2px)] [background-size:40px_40px] animate-parallax-bg" />

            {/*
              中层流光渐变——红色气团
              模糊半径从 120px 降至 60px：GPU 每帧重绘面积减少约 75%，视觉风格基本不变。
              移除 mix-blend-multiply：混合模式需要额外一次 GPU 合成 pass；
              通过将透明度从 /30 降至 /20 来补偿去掉混合后的颜色强度变化。
            */}
            <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-[#ff6b6b]/20 rounded-full blur-[60px] animate-blob" />

            {/* 中层流光渐变——橙色气团（同上） */}
            <div className="absolute top-[20%] right-[-10%] w-[50vw] h-[70vw] max-w-[700px] max-h-[900px] bg-[#fca311]/20 rounded-full blur-[50px] animate-blob animation-delay-2000" />

            {/* 中层流光渐变——白色光晕（无混合模式，仅降低模糊半径） */}
            <div className="absolute bottom-[-20%] left-[20%] w-[70vw] h-[60vw] max-w-[900px] max-h-[800px] bg-white/50 rounded-full blur-[60px] animate-blob animation-delay-4000" />
        </div>
    );
}
