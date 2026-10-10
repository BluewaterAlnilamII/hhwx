export const RESOURCE_TYPES = {
  1: "Item", 2: "MemberCard", 3: "SupportCard", 4: "Voice", 5: "LoginBonus", 6: "Subscription",
  7: "GachaPoint", 8: "Music", 9: "Stamp", 10: "PremiumPass", 11: "EventMedal", 12: "LiveLaneSkin",
  13: "LiveNoteSkin", 14: "LiveNoteEffectSkin", 15: "LiveNoteSEGroup", 16: "VipPoint", 17: "Degree",
  18: "Background", 19: "Spot", 1001: "BiliChatTheme", 1002: "BiliChatBubble", 1003: "BiliChatFrame",
} as const;
export const CARD_TYPES = ["None", "Ruby", "Azure", "Jade", "Amber", "Violet"] as const;
export const MUSIC_TYPES = { ...CARD_TYPES, 99: "All" } as const;
export const GEKISOU_MISSION_TYPES = ["None", "Combo", "Luck", "JustCount", "All"] as const;
