export interface SectionSidebarNavItem {
  id: string;
  label: string;
  href: string;
  matchMode?: "exact" | "prefix";
}

export interface SectionSidebarNavGroup {
  id: string;
  label: string;
  items: SectionSidebarNavItem[];
}

export const siteNavigationGroups: SectionSidebarNavGroup[] = [
  {
    id: "game",
    label: "游戏",
    items: [
      {
        id: "home",
        href: "/",
        label: "首页",
        matchMode: "exact",
      },
    ],
  },
  {
    id: "bandori",
    label: "Bandori",
    items: [
      {
        id: "calendar",
        href: "/bandori/calendar",
        label: "日历",
        matchMode: "prefix",
      },
      {
        id: "tracker",
        href: "/bandori/eventtracker",
        label: "分数追踪器",
        matchMode: "prefix",
      },
    ],
  },
];