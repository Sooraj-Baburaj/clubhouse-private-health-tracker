import { createContext, useContext, type RefObject } from 'react';

/** The scroll container of the current tab pane or stack screen (for collapsing headers and scroll-to). */
export const PaneContext = createContext<RefObject<HTMLDivElement | null> | null>(null);
export const usePaneRef = () => useContext(PaneContext);
