import { Bell, Bot, CalendarRange, Flame, Palette, Salad, Shield, Target, User, UserCheck, type LucideIcon } from 'lucide-react';

export type SectionKey = 'profile' | 'goal' | 'notifications' | 'activity-plan' | 'diet-preferences' | 'ai' | 'privacy' | 'momentum' | 'security' | 'app';

export const SECTIONS: Record<SectionKey, { title: string; sub: string; icon: LucideIcon }> = {
  profile: { title: 'Profile', sub: 'Name, photo, body stats, units', icon: User },
  goal: { title: 'Goal', sub: 'Target weight, pace and your numbers', icon: Target },
  'diet-preferences': { title: 'Diet preferences', sub: 'Allergies, dislikes, cuisines', icon: Salad },
  notifications: { title: 'Notifications', sub: 'Reminders, quiet hours, devices', icon: Bell },
  'activity-plan': { title: 'My activity plan', sub: 'Pick your days, ask for changes', icon: CalendarRange },
  momentum: { title: 'Momentum', sub: 'Grace days, vacations, streaks on Today', icon: Flame },
  privacy: { title: 'Privacy', sub: 'What teammates see, team pulse, roasts', icon: UserCheck },
  ai: { title: 'AI', sub: 'What’s on, what’s sent, your opt-outs', icon: Bot },
  security: { title: 'Security', sub: 'Password and signed-in devices', icon: Shield },
  app: { title: 'App', sub: 'Theme, palette, install, your data', icon: Palette },
};

export const GROUPS: { title: string; keys: SectionKey[] }[] = [
  { title: 'You', keys: ['profile', 'goal', 'diet-preferences'] },
  { title: 'Routine', keys: ['notifications', 'activity-plan', 'momentum'] },
  { title: 'Privacy & data', keys: ['privacy', 'ai', 'security'] },
  { title: 'App', keys: ['app'] },
];

export const isSection = (s: string | undefined): s is SectionKey => !!s && s in SECTIONS;
