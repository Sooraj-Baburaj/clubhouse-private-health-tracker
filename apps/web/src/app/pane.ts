import { createContext, useContext, useEffect, useRef, type RefObject } from 'react';
import { useUi, type TabKey } from './uiStore';

/** The scroll container of the current tab pane or stack screen (for collapsing headers and scroll-to). */
export const PaneContext = createContext<RefObject<HTMLDivElement | null> | null>(null);
export const usePaneRef = () => useContext(PaneContext);

/** Tapping the active tab again scrolls its pane back to the top. */
export function useScrollTopOnReselect(tab: TabKey) {
  const pane = usePaneRef();
  const n = useUi((s) => (s.reselect.tab === tab ? s.reselect.n : 0));
  const seen = useRef(n);
  useEffect(() => {
    if (n === seen.current) return;
    seen.current = n;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pane?.current?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, [n, pane]);
}
