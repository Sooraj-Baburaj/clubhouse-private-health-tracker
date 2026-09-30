import { create } from 'zustand';

export type TabKey = 'today' | 'diet' | 'progress' | 'chat';

interface UiState {
  logSheet: boolean;
  weightSheet: boolean;
  lastTab: TabKey;
  tabDir: 1 | -1;
  openLogSheet: () => void;
  closeLogSheet: () => void;
  openWeightSheet: () => void;
  closeWeightSheet: () => void;
  setTab: (t: TabKey) => void;
}

const ORDER: TabKey[] = ['today', 'diet', 'progress', 'chat'];

export const useUi = create<UiState>((set, get) => ({
  logSheet: false,
  weightSheet: false,
  lastTab: 'today',
  tabDir: 1,
  openLogSheet: () => set({ logSheet: true }),
  closeLogSheet: () => set({ logSheet: false }),
  openWeightSheet: () => set({ weightSheet: true, logSheet: false }),
  closeWeightSheet: () => set({ weightSheet: false }),
  setTab: (t) => {
    const prev = get().lastTab;
    if (prev !== t) set({ lastTab: t, tabDir: ORDER.indexOf(t) >= ORDER.indexOf(prev) ? 1 : -1 });
  },
}));
