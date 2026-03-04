"use client";

import React from "react";
import { CellState } from "@/lib/othello";
import { WeightData } from "@/store/useGameStore";

interface BoardProps {
    board: CellState[][];
    validMoves: { row: number; col: number }[];
    disabled: boolean;
    lastMove: { row: number; col: number } | null;
    onCellClick: (row: number, col: number) => void;
    /** 调试模式下的 AI 权重矩阵，null 表示不显示 */
    debugWeights?: (WeightData | null)[][];
}

/**
 * 将权重值映射为红色→天蓝色的渐变颜色。
 *
 * 为什么使用 HSL 色彩空间：HSL 的色相（H）可以线性插值产生自然的渐变。
 * 红色 H=0，天蓝色 H=195。将权重归一化到 [0, 1] 范围后线性映射到色相值。
 */
function getWeightColor(value: number, min: number, max: number): string {
    if (min === max) return "hsl(195, 85%, 55%)"; // 全部相同时使用天蓝色
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    // 从红色(0) → 天蓝色(195)
    const hue = ratio * 195;
    // 饱和度保持高，亮度从偏暗到偏亮（让低权重红色更醒目，高权重蓝色更清亮）
    const lightness = 40 + ratio * 20;
    return `hsl(${hue}, 90%, ${lightness}%)`;
}

export default function Board({
    board,
    validMoves,
    disabled,
    lastMove,
    onCellClick,
    debugWeights,
}: BoardProps) {
    const isValid = (r: number, c: number) =>
        validMoves.some((m) => m.row === r && m.col === c);

    const isLastMove = (r: number, c: number) =>
        lastMove?.row === r && lastMove?.col === c;

    // 计算权重的全局最小值和最大值（用于颜色归一化）
    let weightMin = Infinity;
    let weightMax = -Infinity;
    if (debugWeights) {
        for (const row of debugWeights) {
            for (const item of row) {
                if (item !== null) {
                    weightMin = Math.min(weightMin, item.total);
                    weightMax = Math.max(weightMax, item.total);
                }
            }
        }
    }

    return (
        <div className="othello-board" style={{ width: "min(85vw, 480px)" }}>
            {board.map((row, r) =>
                row.map((cell, c) => {
                    const weightData = debugWeights?.[r]?.[c] ?? null;
                    const hasWeight = weightData !== null;

                    return (
                        <div
                            key={`${r}-${c}`}
                            className={`othello-cell ${disabled ? "disabled" : ""} ${!disabled && isValid(r, c) ? "valid-hint" : ""} ${hasWeight ? "has-weight" : ""}`}
                            title={hasWeight ? weightData.details : undefined}
                            onClick={() => {
                                if (!disabled && isValid(r, c)) {
                                    onCellClick(r, c);
                                }
                            }}
                            style={{
                                background: isLastMove(r, c)
                                    ? "#2dba5e"
                                    : undefined,
                                position: "relative",
                            }}
                        >
                            {cell && (
                                <div className={`piece ${cell}`} />
                            )}
                            {/* 调试模式下的权重显示 */}
                            {hasWeight && (
                                <span className="debug-weight" title={weightData.details} style={{ color: getWeightColor(weightData.total, weightMin, weightMax) }}>
                                    <div>{Math.round(weightData.total)}</div>
                                    {weightData.probability !== undefined && (
                                        <div style={{ fontSize: '11px', fontWeight: 'normal', marginTop: '-2px' }}>
                                            {Math.round(weightData.probability * 100)}%{weightData.isConfused ? "*" : ""}
                                        </div>
                                    )}
                                </span>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
