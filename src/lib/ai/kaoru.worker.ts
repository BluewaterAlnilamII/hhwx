import { kaoruAI } from "./kaoru";
import { getValidMoves, type CellState, type PlayerColor } from "../othello";

self.onmessage = (event: MessageEvent<{ board: CellState[][]; aiColor: PlayerColor }>) => {
    const { board, aiColor } = event.data;
    if (getValidMoves(board, aiColor).length === 0) {
        self.postMessage({ error: "No valid moves" });
        return;
    }

    self.postMessage({ move: kaoruAI(board, aiColor) });
};
