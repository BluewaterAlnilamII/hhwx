"use client";

import React, { useEffect, useCallback, useRef, useState } from "react";
import { useGameStore } from "@/store/useGameStore";
import { useOthelloGame, GamePhase } from "@/hooks/useOthelloGame";
import {
    PlayerColor,
    getValidMoves,
    isGameOver as checkGameOver,
} from "@/lib/othello";
import {
    getCharacterById,
    getThinkDelay,
    getRandomLine,
} from "@/lib/characters";
import Board from "@/components/Board";
import CharacterAvatar from "@/components/CharacterAvatar";
import SpeechBubble from "@/components/SpeechBubble";
import ResultPanel from "@/components/ResultPanel";
import GuestbookCommentSection from "@/components/GuestbookCommentSection";

// AI 策略模块导入
import { kokoroAI } from "@/lib/ai/kokoro";
import { hagumiAI } from "@/lib/ai/hagumi";
import { kanonAI } from "@/lib/ai/kanon";
import { michelleAI } from "@/lib/ai/michelle";
import { computeAIWeights } from "@/lib/ai/weights";
import { AIRandomContext } from "@/lib/ai/utils";

/**
 * AI 落子分发器：根据角色 ID 调用对应的 AI 策略。
 * 其中 Kaoru 使用 Web Worker 异步执行（因 Minimax 算法计算量大），其余角色同步计算。
 */
function getAIMove(
    characterId: string,
    board: import("@/lib/othello").CellState[][],
    aiColor: PlayerColor,
    context?: AIRandomContext
): Promise<{ row: number; col: number; isConfused?: boolean }> {
    return new Promise((resolve, reject) => {
        try {
            switch (characterId) {
                case "kokoro":
                    resolve(kokoroAI(board, aiColor));
                    break;
                case "kaoru": {
                    // Kaoru 使用 Web Worker 异步执行，防止 Minimax 算法阻塞主线程
                    if (typeof window !== "undefined" && window.Worker) {
                        const worker = new Worker("/kaoru.worker.js");
                        worker.postMessage({ board, aiColor });
                        worker.onmessage = (e) => {
                            worker.terminate();
                            if (e.data.error) {
                                reject(new Error(e.data.error));
                            } else {
                                resolve(e.data.move);
                            }
                        };
                        worker.onerror = (e) => {
                            worker.terminate();
                            reject(new Error(e.message || "Worker error"));
                        };
                    } else {
                        // 兜底方案：同步执行（在浏览器环境中不应发生）
                        import("@/lib/ai/kaoru").then(({ kaoruAI }) => {
                            resolve(kaoruAI(board, aiColor));
                        });
                    }
                    break;
                }
                case "hagumi":
                    resolve(hagumiAI(board, aiColor));
                    break;
                case "kanon":
                    resolve(kanonAI(board, aiColor, context));
                    break;
                case "michelle":
                    resolve(michelleAI(board, aiColor));
                    break;
                default:
                    // 兜底：随机落子
                    const moves = getValidMoves(board, aiColor);
                    resolve(moves[Math.floor(Math.random() * moves.length)]);
            }
        } catch (e) {
            reject(e);
        }
    });
}

export default function GamePage() {
    const {
        playerCharacter,
        aiCharacter,
        resetSelection,
        debugMode,
        aiWeights,
        setAIWeights,
        clearAIWeights,
        playerColor: storePlayerColor,
        reviewingBoard,
        setReviewingBoard,
    } = useGameStore();

    // 使用 store 中玩家选择的颜色
    const playerColor: PlayerColor = storePlayerColor;
    const aiColor: PlayerColor = storePlayerColor === "black" ? "white" : "black";

    const playerChar = playerCharacter ? getCharacterById(playerCharacter.id) : null;
    const aiChar = aiCharacter ? getCharacterById(aiCharacter.id) : null;

    const {
        state,
        validMoves,
        pieces,
        gameOver,
        placePiece,
        setPhase,
        switchTurn,
        showPass,
        lock,
        unlock,
        endGame,
        reset,
    } = useOthelloGame(playerColor, playerChar && aiChar ? { playerId: playerChar.id, aiId: aiChar.id } : undefined);

    const [playerBubble, setPlayerBubble] = useState({ text: "", visible: false });
    const [aiBubble, setAIBubble] = useState({ text: "", visible: false });
    const [aiEmotion, setAIEmotion] = useState<"idle" | "think" | "attack">("idle");
    const [playerEmotion, setPlayerEmotion] = useState<"idle" | "attack">("idle");
    const processingRef = useRef(false);

    // 追踪已落子次数，用于语音互斥逻辑
    const moveCountRef = useRef(0);
    // 标记 AI 在思考阶段是否应显示气泡（由 handleCellClick 设置）
    const aiShouldSpeakRef = useRef(false);

    // 监测游戏是否结束
    useEffect(() => {
        if (gameOver && state.gamePhase !== "ended") {
            endGame();
        }
    }, [gameOver, state.gamePhase, endGame]);

    /**
     * AI 回合流水线编排。
     *
     * 为什么设计成异步流水线：整个 AI 回合包含"思考 → 落子 → 攻击台词"三个阶段，
     * 每个阶段都有独立的动画延迟和气泡展示时长。使用 async/await 串联这些阶段，
     * 既保证了思考、落子和台词展示的严格时序，又通过 processingRef 互斥锁
     * 防止 useEffect 重复触发导致并发执行。
     */
    useEffect(() => {
        if (
            state.currentPlayer !== aiColor ||
            state.gamePhase === "ended" ||
            processingRef.current
        ) {
            return;
        }

        // 检查 AI 是否有合法落子点
        const aiMoves = getValidMoves(state.board, aiColor);
        if (aiMoves.length === 0) {
            // 检查游戏是否结束
            if (checkGameOver(state.board)) {
                endGame();
                return;
            }
            // 跳过回合 —— 必须重置所有状态锁和阶段标记，否则会卡住
            showPass("AI 无处落子，回合跳过");
            setTimeout(() => {
                switchTurn();
                setPhase("playing"); // 关键：将 gamePhase 恢复为 playing，否则玩家无法操作
                unlock();
                processingRef.current = false; // 清除互斥锁
            }, 2000);
            return;
        }

        // 开始 AI 回合序列
        processingRef.current = true;
        lock();

        // 提前决定随机上下文（用于同步权重提示与实际落子算法）
        const randomContext: AIRandomContext = {
            kanonConfused: Math.random() < 0.20
        };

        // 调试模式：计算并设置 AI 权重（清除上一轮后设置新一轮）
        if (debugMode && aiChar) {
            clearAIWeights();
            const weights = computeAIWeights(aiChar.id, state.board, aiColor, randomContext);
            setAIWeights(weights);
        }

        const runAITurn = async () => {
            if (!aiChar) return;

            // 若是 AI 先手的第一步，强制展示 AI 的思考语音
            const isAIFirstMove = moveCountRef.current === 0;
            const shouldSpeakThink = aiShouldSpeakRef.current || isAIFirstMove;

            // 阶段 1：AI 思考期
            setPhase("aiThinking");
            setAIEmotion("think");

            if (shouldSpeakThink) {
                // 延迟 0.5 秒后再显示气泡，让过渡更自然
                await new Promise((r) => setTimeout(r, 500));

                // 确认当前仍处于思考阶段（未被中断/重置）
                if (processingRef.current) {
                    const thinkLine = getRandomLine(aiChar.thinkLines);
                    setAIBubble({ text: thinkLine, visible: true });
                }
            }

            const thinkDelay = getThinkDelay(aiChar.thinkTime);

            // 并行执行 AI 算法计算和思考延迟等待
            const [aiMove] = await Promise.all([
                getAIMove(aiChar.id, state.board, aiColor, randomContext),
                // 若已展示气泡则减去已等待的 500ms
                new Promise((r) => setTimeout(r, shouldSpeakThink ? Math.max(0, thinkDelay - 500) : thinkDelay)),
            ]);

            // 阶段 2：AI 落子
            if (shouldSpeakThink) {
                setAIBubble({ text: "", visible: false });
                await new Promise((r) => setTimeout(r, 200));
            }

            placePiece(aiMove.row, aiMove.col, aiColor);
            setAIEmotion("attack");

            // 阶段 3：AI 攻击台词 —— 落子时始终显示
            const boardAfter = state.board;
            const willEndAfterThis = checkGameOver(boardAfter);

            setPhase("aiLine");
            const attackLine = aiMove.isConfused ? (aiChar.confusedLine || "呼诶诶~~~") : getRandomLine(aiChar.attackLines);
            setAIBubble({ text: attackLine, visible: true });
            await new Promise((r) => setTimeout(r, 1500));

            setAIBubble({ text: "", visible: false });

            setAIEmotion("idle");

            // 清除可能还在显示的玩家气泡（防止重叠）
            setPlayerBubble({ text: "", visible: false });
            setPlayerEmotion("idle");

            // 阶段 4：切换回合给玩家
            switchTurn();

            // 短暂等待以确保状态同步
            await new Promise((r) => setTimeout(r, 100));

            setPhase("playing");
            unlock();
            processingRef.current = false;
        };

        runAITurn().catch((e) => {
            console.error("AI 回合执行出错：", e);
            processingRef.current = false;
            unlock();
            setPhase("playing");
        });
    }, [
        state.currentPlayer,
        state.board,
        state.gamePhase,
        aiColor,
        aiChar,
        lock,
        unlock,
        setPhase,
        switchTurn,
        showPass,
        endGame,
        placePiece,
    ]);

    // AI 回合结束后检查玩家是否需要跳过
    useEffect(() => {
        if (
            state.currentPlayer === playerColor &&
            !processingRef.current
        ) {
            // 放宽 gamePhase 条件：只要不在 ended 阶段且轮到玩家，就检查是否需要 pass
            if (state.gamePhase === "ended") return;

            const playerMoves = getValidMoves(state.board, playerColor);
            if (playerMoves.length === 0) {
                if (checkGameOver(state.board)) {
                    endGame();
                    return;
                }
                // 玩家无处落子 → 自动跳过回合并交还给 AI
                lock(); // 锁定棋盘，防止状态异常
                showPass("无处落子，回合跳过");
                setTimeout(() => {
                    switchTurn();
                    setPhase("playing"); // 恢复 phase 以便 AI useEffect 能正确触发
                    unlock();
                }, 2000);
            } else {
                // 确保玩家有合法落子时 phase 一定是 playing 且棋盘解锁
                if (state.gamePhase !== "playing") {
                    setPhase("playing");
                }
            }
        }
    }, [state.currentPlayer, state.gamePhase, state.board, playerColor, showPass, switchTurn, endGame, lock, unlock, setPhase]);

    /**
     * 处理玩家点击棋盘。
     *
     * 语音互斥机制设计说明：
     * 为避免玩家和 AI 的气泡同时出现导致视觉混乱，采用互斥策略：
     * - 第一步：玩家一定发言，AI 默默思考（给玩家"先声夺人"的体验）
     * - 后续步骤：50% 概率玩家发言（AI 不发言），50% 概率 AI 发言（玩家不发言）
     * 这样既保留了角色互动的丰富性，又确保同一时刻只有一个角色在说话。
     */
    const handleCellClick = useCallback(
        (row: number, col: number) => {
            if (state.isLocked || state.gamePhase !== "playing") return;
            if (state.currentPlayer !== playerColor) return;

            // 立即锁定棋盘，防止连续点击
            lock();

            // 执行落子
            placePiece(row, col, playerColor);
            setPlayerEmotion("attack");

            // 递增落子计数
            moveCountRef.current += 1;
            const currentMove = moveCountRef.current;

            // 语音互斥逻辑
            let playerSpeaks: boolean;
            if (currentMove === 1) {
                // 第一步：玩家一定发言
                playerSpeaks = true;
            } else {
                // 后续 50% 概率
                playerSpeaks = Math.random() < 0.5;
            }

            // 设置 AI 思考阶段是否发言
            aiShouldSpeakRef.current = !playerSpeaks;

            if (playerSpeaks && playerChar) {
                // 显示玩家气泡（无延迟 —— AI 在气泡显示的同时已开始计算）
                const line = getRandomLine(playerChar.attackLines);
                setPlayerBubble({ text: line, visible: true });

                // 2 秒后自动隐藏玩家气泡
                setTimeout(() => {
                    setPlayerBubble({ text: "", visible: false });
                    setPlayerEmotion("idle");
                }, 2000);
            }

            // 立即切换到 AI 回合（不等待气泡消失）
            setPhase("playerLine");
            switchTurn();
        },
        [state.isLocked, state.gamePhase, state.currentPlayer, playerColor, playerChar, lock, placePiece, setPhase, switchTurn]
    );

    const handleRestart = () => {
        processingRef.current = false;
        moveCountRef.current = 0;
        setPlayerBubble({ text: "", visible: false });
        setAIBubble({ text: "", visible: false });
        setAIEmotion("idle");
        setPlayerEmotion("idle");
        clearAIWeights();
        setReviewingBoard(false);
        reset();
    };

    const handleReturnToSelect = () => {
        localStorage.removeItem("hhwx-othello-game");
        processingRef.current = false;
        moveCountRef.current = 0;
        clearAIWeights();
        setReviewingBoard(false);
        resetSelection();
    };

    const handleGiveUp = () => {
        localStorage.removeItem("hhwx-othello-game");
        processingRef.current = false;
        moveCountRef.current = 0;
        setPlayerBubble({ text: "", visible: false });
        setAIBubble({ text: "", visible: false });
        setAIEmotion("idle");
        setPlayerEmotion("idle");
        clearAIWeights();
        resetSelection();
    };

    if (!playerChar || !aiChar) return null;

    const currentPlayerValidMoves =
        state.currentPlayer === playerColor && state.gamePhase === "playing"
            ? validMoves
            : [];

    return (
        <div className="relative z-10 min-h-full flex flex-col items-center px-4 py-4 lg:py-5">
            {/* 分数栏 */}
            <div className="flex items-center gap-6 mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-gray-700 to-black shadow" />
                    <span className="text-lg font-bold text-gray-800">{pieces.black}</span>
                </div>
                <span className="text-gray-400 font-light">vs</span>
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-white to-gray-200 shadow border border-gray-300" />
                    <span className="text-lg font-bold text-gray-800">{pieces.white}</span>
                </div>
            </div>

            {/* 桌面端：主游戏区域 */}
            <div className="relative flex items-center justify-center w-full max-w-3xl">
                {/* AI 角色（左上角） */}
                <div className="hidden sm:flex absolute left-0 top-0 flex-col items-start gap-2 z-20">
                    <CharacterAvatar
                        characterId={aiChar.id}
                        avatarSrc={aiChar.avatar}
                        color={aiChar.color}
                        playerColor={aiColor}
                        size="sm"
                    />
                    <div className="text-xs font-bold text-gray-700">{aiChar.nameJp}</div>
                    <SpeechBubble
                        text={aiBubble.text}
                        visible={aiBubble.visible}
                        position="left"
                    />
                </div>

                {/* 棋盘 */}
                <Board
                    board={state.board}
                    validMoves={currentPlayerValidMoves}
                    disabled={state.isLocked || state.gamePhase !== "playing"}
                    lastMove={state.lastMove}
                    onCellClick={handleCellClick}
                    debugWeights={debugMode ? aiWeights : undefined}
                />

                {/* 玩家角色（右下角） */}
                <div className="hidden sm:flex absolute right-0 bottom-0 flex-col items-end gap-2 z-20">
                    <SpeechBubble
                        text={playerBubble.text}
                        visible={playerBubble.visible}
                        position="right"
                    />
                    <CharacterAvatar
                        characterId={playerChar.id}
                        avatarSrc={playerChar.avatar}
                        color={playerChar.color}
                        playerColor={playerColor}
                        size="sm"
                    />
                    <div className="text-xs font-bold text-gray-700">{playerChar.nameJp}</div>
                </div>
            </div>

            {/* 移动端：底部角色及控制区 */}
            <div className="flex sm:hidden w-full max-w-md mt-6 justify-between items-end px-2 z-20">
                {/* AI 角色（左侧） */}
                <div className="flex flex-col items-start gap-1">
                    <SpeechBubble
                        text={aiBubble.text}
                        visible={aiBubble.visible}
                        position="left"
                    />
                    <CharacterAvatar
                        characterId={aiChar.id}
                        avatarSrc={aiChar.avatar}
                        color={aiChar.color}
                        playerColor={aiColor}
                        size="sm"
                    />
                    <div className="text-xs font-bold text-gray-700">{aiChar.nameJp}</div>
                </div>

                {/* 中间按钮/状态核心区 */}
                <div className="flex flex-col items-center gap-3 mb-2 flex-1 px-2">
                    {/* 回合指示器 */}
                    <div className="px-4 py-2 rounded-full bg-white/88 text-xs font-medium text-gray-600 shadow-sm text-center whitespace-nowrap">
                        {state.gamePhase === "playing" && state.currentPlayer === playerColor
                            ? "🎮 你的回合"
                            : state.gamePhase === "aiThinking" || state.currentPlayer === aiColor
                                ? "🤔 AI 思考中..."
                                : state.gamePhase === "ended"
                                    ? "🏁 游戏结束"
                                    : "🎮 你的回合"}
                    </div>

                    {/* 按钮区域 */}
                    {state.gamePhase !== "ended" ? (
                        <button
                            onClick={handleGiveUp}
                            className="w-full max-w-[120px] px-3 py-2 bg-white/82 border border-gray-300 text-xs font-medium text-gray-600 rounded-full hover:bg-red-50 hover:border-red-300 hover:text-red-600 shadow-sm"
                        >
                            🚪 放弃这局
                        </button>
                    ) : reviewingBoard ? (
                        <div className="flex flex-col gap-2 w-full max-w-[120px]">
                            <button
                                onClick={handleRestart}
                                className="w-full px-3 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-full hover:opacity-90 shadow-sm text-xs"
                            >
                                🔄 重新开始
                            </button>
                            <button
                                onClick={handleReturnToSelect}
                                className="w-full px-3 py-2 bg-white/82 border border-gray-300 text-xs font-medium text-gray-600 rounded-full hover:bg-white/92 shadow-sm"
                            >
                                🎭 重选角色
                            </button>
                        </div>
                    ) : null}
                </div>

                {/* 玩家角色（右侧） */}
                <div className="flex flex-col items-end gap-1">
                    <SpeechBubble
                        text={playerBubble.text}
                        visible={playerBubble.visible}
                        position="right"
                    />
                    <CharacterAvatar
                        characterId={playerChar.id}
                        avatarSrc={playerChar.avatar}
                        color={playerChar.color}
                        playerColor={playerColor}
                        size="sm"
                    />
                    <div className="text-xs font-bold text-gray-700">{playerChar.nameJp}</div>
                </div>
            </div>

            {/* 桌面端：中控及按钮区 */}
            <div className="hidden sm:flex flex-col items-center">
                {/* 回合指示器 */}
                <div className="mt-4 px-4 py-2 rounded-full bg-white/88 text-sm font-medium text-gray-600 shadow-sm">
                    {state.gamePhase === "playing" && state.currentPlayer === playerColor
                        ? "🎮 你的回合"
                        : state.gamePhase === "aiThinking" || state.currentPlayer === aiColor
                            ? "🤔 AI 思考中..."
                            : state.gamePhase === "ended"
                                ? "🏁 游戏结束"
                                : "🎮 你的回合"}
                </div>

                {/* 底部按钮区域 */}
                {state.gamePhase !== "ended" ? (
                    <button
                        onClick={handleGiveUp}
                        className="mt-3 px-5 py-2 bg-white/82 border border-gray-300 text-sm font-medium text-gray-600 rounded-full hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors duration-200 shadow-sm"
                    >
                        🚪 放弃这局
                    </button>
                ) : reviewingBoard ? (
                    <div className="mt-3 flex flex-col gap-3">
                        <button
                            onClick={handleRestart}
                            className="px-5 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-full hover:opacity-90 transition text-sm shadow-sm"
                        >
                            🔄 重新开始
                        </button>
                        <button
                            onClick={handleReturnToSelect}
                            className="px-5 py-2 bg-white/82 border border-gray-300 text-sm font-medium text-gray-600 rounded-full hover:bg-white/92 transition-colors duration-200 shadow-sm"
                        >
                            🎭 重选角色
                        </button>
                    </div>
                ) : null}
            </div>

            {/* 跳过回合通知 */}
            {state.passMessage && (
                <div className="pass-notification">{state.passMessage}</div>
            )}

            {/* 结算面板（回看模式时隐藏） */}
            {state.gamePhase === "ended" && !reviewingBoard && (
                <ResultPanel
                    blackCount={pieces.black}
                    whiteCount={pieces.white}
                    playerColor={playerColor}
                    playerName={playerChar.nameJp}
                    aiName={aiChar.nameJp}
                    onRestart={handleRestart}
                    onReturnToSelect={handleReturnToSelect}
                    onReviewBoard={() => setReviewingBoard(true)}
                />
            )}

            {/* 评论区 */}
            <GuestbookCommentSection />
        </div>
    );
}
