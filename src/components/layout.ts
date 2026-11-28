import { createContext, useContext } from "react";

/** The shell the page is in, chosen by the width of .cf-root: compact below 768, rail to 1023, sidebar from 1024. */
export type LayoutMode = "compact" | "rail" | "sidebar";

export const LayoutContext = createContext<LayoutMode>("compact");

export const useLayout = (): LayoutMode => useContext(LayoutContext);

/** Where Files puts its New menu from 1024 px (design: "+ New" at the top of the sidebar). Empty on other screens. */
export const SIDEBAR_NEW_ID = "coffer-sidebar-new";
