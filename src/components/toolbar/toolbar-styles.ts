export const toolbarIconButtonClassName = "group relative flex h-9 w-9 items-center justify-center rounded-[15px] border border-[var(--theme-color-toolbar-control-border)] bg-[var(--theme-color-toolbar-control-background)] text-left text-[var(--theme-color-toolbar-control-foreground)] shadow-[var(--theme-shadow-toolbar-control)] outline-hidden transition duration-200 hover:-translate-y-0.5 hover:scale-[1.03] hover:bg-[var(--theme-color-toolbar-control-background-hover)] hover:shadow-[var(--theme-shadow-toolbar-control-hover)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring-on-dark)]";

export const toolbarIconInnerClassName = "relative flex h-7 w-7 items-center justify-center rounded-[13px] bg-[var(--theme-color-toolbar-control-icon-background)] text-[var(--theme-color-toolbar-control-icon-foreground)] transition duration-200 group-hover:scale-105 group-hover:bg-[var(--theme-color-toolbar-control-icon-background-hover)]";

export const toolbarMenuAppearanceClassName = "z-10 overflow-hidden rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] shadow-[var(--theme-shadow-toolbar-menu)]";

export const toolbarMenuSurfaceClassName = `absolute right-0 top-full mt-3 ${toolbarMenuAppearanceClassName}`;

export const toolbarMenuClassName = `${toolbarMenuSurfaceClassName} w-64`;
