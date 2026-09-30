import { z } from 'zod';
import { NotificationType } from '../enums';
import { HHmmStr } from './common';

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  readAt: string | null;
}

export interface InboxResponse {
  items: NotificationDto[];
  unread: number;
  nextCursor: string | null;
}

export const PushSubscribeRequest = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(4).max(100) }),
  platform: z.string().max(40).optional(),
});
export type PushSubscribeRequest = z.infer<typeof PushSubscribeRequest>;

export interface DeviceDto {
  id: string;
  platform: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  failing: boolean;
  thisDevice: boolean;
}

export interface NotificationPrefDto {
  type: string;
  label: string;
  hint: string;
  group: 'meals' | 'activity' | 'momentum' | 'chat' | 'team' | 'system';
  enabled: boolean;
  time: string | null;
  days: number[];
  smartTime: boolean;
  smartTimeValue: string | null;
  supportsTime: boolean;
  supportsDays: boolean;
  supportsSmartTime: boolean;
  locked: boolean;
}

export const NotificationPrefUpdate = z.object({
  items: z
    .array(z.object({ type: NotificationType, enabled: z.boolean().optional(), time: HHmmStr.nullable().optional(), days: z.array(z.number().int().min(0).max(6)).max(7).optional(), smartTime: z.boolean().optional() }))
    .min(1)
    .max(20),
});
export type NotificationPrefUpdate = z.infer<typeof NotificationPrefUpdate>;

export const SnoozeRequest = z.object({ minutes: z.number().int().min(10).max(24 * 60).default(60) });
