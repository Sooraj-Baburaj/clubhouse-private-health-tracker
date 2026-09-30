import { Fragment } from 'react';
import { cn } from '@/lib/cn';

const TOKEN = /(@[A-Za-z0-9_.]{2,30}|https?:\/\/[^\s]+)/g;

/** Message body with @mention highlighting and plain links. */
export function MessageText({ body, usernames, me, own }: { body: string; usernames: Set<string>; me: string; own: boolean }) {
  const parts = body.split(TOKEN);
  return (
    <span className="whitespace-pre-wrap break-words text-[15px] leading-[1.45]">
      {parts.map((p, i) => {
        if (p.startsWith('@') && usernames.has(p.slice(1).toLowerCase())) {
          const isMe = p.slice(1).toLowerCase() === me.toLowerCase();
          return (
            <span key={i} className={cn('rounded-md px-0.5 font-extrabold', own ? 'underline decoration-2 underline-offset-2' : isMe ? 'bg-accent text-on-accent-fill' : 'bg-accent-200 text-accent-800')}>
              {p}
            </span>
          );
        }
        if (/^https?:\/\//.test(p))
          return (
            <a key={i} href={p} target="_blank" rel="noopener noreferrer" className={cn('break-all underline', own && 'text-on-accent')}>
              {p}
            </a>
          );
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </span>
  );
}
