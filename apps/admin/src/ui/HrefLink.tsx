import { useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Link for server-provided URLs ("/admin/members?…" or "/members?…"): client-side navigation, basepath-aware. */
export function HrefLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  const external = /^https?:\/\//.test(href);
  const full = external || href.startsWith('/admin') ? href : `/admin${href.startsWith('/') ? '' : '/'}${href}`;
  return (
    <a
      href={full}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={cn('font-medium', className)}
      onClick={(e) => {
        if (external || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        void router.navigate({ href: full });
      }}
    >
      {children}
    </a>
  );
}
