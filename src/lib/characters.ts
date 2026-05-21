import { buildHhwxSiteResCdnUrl } from "@/lib/site-assets";

export type ThinkTime = "short" | "medium" | "long";

export interface Character {
    id: string;
    name: string;
    nameJp: string;
    color: string;
    avatar: string;
    description: string;
    thinkTime: ThinkTime;
    thinkLines: string[];
    attackLines: string[];
    confusedLine?: string;
}

export const CHARACTERS: Character[] = [
    {
        id: "kokoro",
        name: "Kokoro",
        nameJp: "弦巻 こころ",
        color: "#FFD700",
        avatar: buildHhwxSiteResCdnUrl("kokoro.png"),
        description: "依靠直觉的战略型选手，热衷于稳固自身棋子并对边角区域展开激烈争夺。",
        thinkTime: "short",
        thinkLines: [
            "嗯～让我想想呢！",
            "哦呀？这是什么局面？",
            "嘻嘻，有点意思～",
            "等一下哦～马上就好！",
            "这个嘛……",
        ],
        attackLines: [
            "笑容满面地下棋才是最棒的！",
            "嘿嘿，看招！",
            "让全世界都笑起来！",
            "这一手如何？✨",
            "快乐就是最强的武器！",
        ],
    },
    {
        id: "kaoru",
        name: "Kaoru",
        nameJp: "瀬田 薫",
        color: "#9B59B6",
        avatar: buildHhwxSiteResCdnUrl("kaoru.png"),
        description: "极其梦幻的神秘人物，并在这里拥有极其梦幻的实力，正在等待极其梦幻的挑战者。",
        thinkTime: "long",
        thinkLines: [
            "ふふ……这便是命运的棋局。",
            "且让我沉思片刻……",
            "如此刹那，转瞬即逝……",
            "命运的齿轮正在转动……",
            "这一局……可真是儚い呢。",
        ],
        attackLines: [
            "这便是……刹那的闪耀。",
            "儚い……但这就是美。",
            "命运已然注定。",
            "请接受这份优雅。",
            "ふふ，如梦似幻。",
        ],
    },
    {
        id: "hagumi",
        name: "Hagumi",
        nameJp: "北沢 はぐみ",
        color: "#FF6B35",
        avatar: buildHhwxSiteResCdnUrl("hagumi.png"),
        description: "下棋有气势，倾向翻转最多棋子，常忽略边角战略。",
        thinkTime: "medium",
        thinkLines: [
            "嗯嗯……让我看看！",
            "哪里好呢～",
            "肚子有点饿了……啊不对，在下棋！",
            "可乐饼的话……不是啦！",
            "嘿嘿，我在认真想哦！",
        ],
        attackLines: [
            "嘿！翻了好多！",
            "看我的！哈！",
            "好厉害好厉害！",
            "可乐饼大作战！……啊不是。",
            "冲啊——！",
        ],
    },
    {
        id: "kanon",
        name: "Kanon",
        nameJp: "松原 花音",
        color: "#FF69B4",
        avatar: buildHhwxSiteResCdnUrl("kanon.png"),
        description: "精通行动力压制战术，但在部分回合会因犯迷糊而出现失误。",
        thinkTime: "long",
        thinkLines: [
            "呜呜……好难选……",
            "那个……让我再想想……",
            "要是下错了怎么办……",
            "嗯……嗯……",
            "对不起，我在努力思考中……",
        ],
        attackLines: [
            "那、那我下这里了……！",
            "呜……鼓起勇气！",
            "虽然不太有自信……但是！",
            "请、请多关照……",
            "我、我做到了……！",
        ],
        confusedLine: "呼诶诶~~~",
    },
    {
        id: "michelle",
        name: "Michelle",
        nameJp: "ミッシェル",
        color: "#FF91A4",
        avatar: buildHhwxSiteResCdnUrl("michelle.png"),
        description: "是一只神秘的熊。",
        thinkTime: "medium",
        thinkLines: [
            "（Michelle正在思考……）",
            "嗯，让我看看局势……",
            "呵呵，稍等一下哦。",
            "这个局面嘛……",
            "（认真分析中）",
        ],
        attackLines: [
            "这一步应该不错。",
            "呵呵，接招吧。",
            "Michelle的选择！",
            "就是这里了。",
            "慢慢来，不着急～",
        ],
    },
];

/** 根据 ID 查找角色数据。 */
export function getCharacterById(id: string): Character | undefined {
    return CHARACTERS.find((c) => c.id === id);
}

/** 根据思考时间类别返回随机思考延迟（毫秒）。 */
export function getThinkDelay(thinkTime: ThinkTime): number {
    switch (thinkTime) {
        case "short":
            return 1000 + Math.random() * 2000; // 1~3 秒
        case "medium":
            return 2000 + Math.random() * 2000; // 2~4 秒
        case "long":
            return 3000 + Math.random() * 2000; // 3~5 秒
    }
}

/** 从台词数组中随机选取一条。 */
export function getRandomLine(lines: string[]): string {
    return lines[Math.floor(Math.random() * lines.length)];
}
