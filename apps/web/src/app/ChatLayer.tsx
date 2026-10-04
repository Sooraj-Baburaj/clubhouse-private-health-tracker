import { useRouter } from '@tanstack/react-router';
import { motion, useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { ChatPage } from '@/pages/chat/ChatPage';
import { EdgeSwipe } from '@/ui/molecules/EdgeSwipe';
import { PaneContext } from './pane';

/** Leave the chat: back to where it was opened from, or to Team when it was opened straight from a link. */
export function useCloseChat() {
  const router = useRouter();
  return () => (router.history.canGoBack() ? router.history.back() : void router.navigate({ to: '/team', replace: true }));
}

/**
 * Team chat as a full-screen layer over the tabs (/chat). It grows out of the Chat pill and is kept mounted after the
 * first open (hidden and inert when closed), so the draft, the scroll position and the unread marker survive — the
 * same reason the tabs stay mounted (APP-NAV-07). Back, the header chevron or a swipe from the left edge closes it.
 */
export function ChatLayer({ open }: { open: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const close = useCloseChat();
  const [mounted, setMounted] = useState(open);
  // Mount on first open (adjust state during render).
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-bg"
      // Grows from the Chat pill (bottom right, above the tab bar).
      style={{ transformOrigin: 'calc(100% - 60px) calc(100% - 130px)' }}
      // It first mounts on open, so it grows in from the closed state.
      initial={{ opacity: 0, scale: reduce ? 1 : 0.6, borderRadius: reduce ? 0 : 44 }}
      animate={
        open
          ? { visibility: 'visible', opacity: 1, scale: 1, borderRadius: 0, transition: reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 380, damping: 34, opacity: { duration: 0.18 } } }
          : { opacity: 0, scale: reduce ? 1 : 0.6, borderRadius: reduce ? 0 : 44, transition: { duration: reduce ? 0.2 : 0.22, ease: [0.4, 0, 1, 1] }, transitionEnd: { visibility: 'hidden' } }
      }
      aria-hidden={!open || undefined}
      inert={!open || undefined}
    >
      <PaneContext.Provider value={ref}>
        <div ref={ref} className="pane h-full overflow-y-auto overflow-x-hidden" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <ChatPage onBack={close} />
        </div>
      </PaneContext.Provider>
      {open && <EdgeSwipe onBack={close} />}
    </motion.div>
  );
}
