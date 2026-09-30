import { create } from 'zustand';

/** Global state for the 12-hour admin re-authentication prompt (NFR-SEC-06). */
export const useReauth = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
