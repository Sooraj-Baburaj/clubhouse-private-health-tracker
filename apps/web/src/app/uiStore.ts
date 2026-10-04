import { create } from 'zustand';

export type TabKey = 'today' | 'diet' | 'progress' | 'team';

interface UiState {
  logSheet: boolean;
  weightSheet: boolean;
  lastTab: TabKey;
  tabDir: 1 | -1;
  /** Bumped when the active tab is tapped again (the tab scrolls to its top). */
  reselect: { tab: TabKey; n: number };
  openLogSheet: () => void;
  closeLogSheet: () => void;
  openWeightSheet: () => void;
  closeWeightSheet: () => void;
  setTab: (t: TabKey) => void;
  reselectTab: (t: TabKey) => void;
}

const ORDER: TabKey[] = ['today', 'diet', 'progress', 'team'];

export const useUi = create<UiState>((set, get) => ({
  logSheet: false,
  weightSheet: false,
  lastTab: 'today',
  tabDir: 1,
  reselect: { tab: 'today', n: 0 },
  openLogSheet: () => set({ logSheet: true }),
  closeLogSheet: () => set({ logSheet: false }),
  openWeightSheet: () => set({ weightSheet: true, logSheet: false }),
  closeWeightSheet: () => set({ weightSheet: false }),
  setTab: (t) => {
    const prev = get().lastTab;
    if (prev !== t) set({ lastTab: t, tabDir: ORDER.indexOf(t) >= ORDER.indexOf(prev) ? 1 : -1 });
  },
  reselectTab: (t) => set((s) => ({ reselect: { tab: t, n: s.reselect.n + 1 } })),
}));
