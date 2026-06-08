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
    id: "game",
    labelKey: "groups.game",
    items: [
      {
        id: "home",
        href: "/",
        labelKey: "items.home",
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
        href: "/bandori/eventtracker",
        labelKey: "items.tracker",
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
];
