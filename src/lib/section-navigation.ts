export interface SectionSidebarNavItem {
  id: string;
  labelKey: string;
  href: string;
  matchMode?: "exact" | "prefix";
}

export interface SectionSidebarNavGroup {
  id: string;
  labelKey: string;
  items: SectionSidebarNavItem[];
}

export const siteNavigationGroups: SectionSidebarNavGroup[] = [
  {
    id: "hhwx",
    labelKey: "groups.hhwx",
    items: [
      {
        id: "home",
        href: "/",
        labelKey: "items.home",
        matchMode: "exact",
      },
      {
        id: "status",
        href: "/status",
        labelKey: "items.serviceStatus",
        matchMode: "exact",
      },
    ],
  },
  {
    id: "bandori",
    labelKey: "groups.bandori",
    items: [
      {
        id: "calendar",
        href: "/bandori/calendar",
        labelKey: "items.calendar",
        matchMode: "prefix",
      },
      {
        id: "tracker",
        href: "/bandori/events",
        labelKey: "items.tracker",
        matchMode: "prefix",
      },
      {
        id: "cards",
        href: "/bandori/cards",
        labelKey: "items.cards",
        matchMode: "prefix",
      },
      {
        id: "songs",
        href: "/bandori/songs",
        labelKey: "items.songs",
        matchMode: "prefix",
      },
      {
        id: "player",
        href: "/bandori/player",
        labelKey: "items.player",
        matchMode: "prefix",
      },
      {
        id: "game-profiles",
        href: "/bandori/game-profiles",
        labelKey: "items.gameProfiles",
        matchMode: "prefix",
      },
      {
        id: "teambuilder",
        href: "/bandori/teambuilder",
        labelKey: "items.teambuilder",
        matchMode: "prefix",
      },
    ],
  },
  {
    id: "game",
    labelKey: "groups.game",
    items: [
      {
        id: "othello",
        href: "/othello",
        labelKey: "items.othello",
        matchMode: "exact",
      },
    ],
  },
];
