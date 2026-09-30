import type { ActivityLogDto, FoodLogDto, WeightEntryDto } from '@clubhouse/contracts';
import { schema as s } from '@clubhouse/db';
import { pick, type ImageUrls } from './images';

type FoodLogRow = typeof s.foodLogs.$inferSelect;
type ActivityLogRow = typeof s.activityLogs.$inferSelect;
type TypeRow = typeof s.activityTypes.$inferSelect;
type WeightRow = typeof s.weightEntries.$inferSelect;

export function foodLogDto(r: FoodLogRow, images: Map<string, ImageUrls>): FoodLogDto {
  const img = pick(images, r.imageId);
  return {
    id: r.id,
    date: r.date,
    mealSlot: r.mealSlot as FoodLogDto['mealSlot'],
    loggedAt: r.loggedAt.toISOString(),
    items: r.items.map((i) => ({
      foodId: i.foodId,
      name: i.name,
      grams: i.grams,
      servings: i.servings,
      servingLabel: i.servingLabel,
      nutrition: i.nutrition,
      source: i.source,
      dietOptionId: i.dietOptionId ?? null,
      aiEstimate: !!i.aiEstimate,
      confidence: i.confidence ?? null,
      tags: i.tags ?? [],
    })),
    totals: r.totals,
    imageUrl: img.url,
    thumbUrl: img.thumbUrl,
    imageExpired: img.expired,
    aiGenerated: r.aiGenerated,
    aiCallId: r.aiCallId,
    confidence: r.confidence,
    note: r.note,
    addedLate: r.addedLate,
    clientUpdatedAt: r.clientUpdatedAt.toISOString(),
    deleted: !!r.deletedAt,
  };
}

export function activityLogDto(r: ActivityLogRow, t: TypeRow | undefined): ActivityLogDto {
  return {
    id: r.id,
    date: r.date,
    loggedAt: r.loggedAt.toISOString(),
    typeId: r.typeId,
    typeKey: t?.key ?? 'other',
    typeName: t?.name ?? 'Activity',
    icon: t?.icon ?? 'activity',
    durationMin: r.durationMin,
    distanceKm: r.distanceKm,
    intensity: r.intensity,
    focus: r.focus,
    kcalBurned: Math.round(r.kcalBurned),
    kcalOverridden: r.kcalOverridden,
    met: r.met,
    planItemId: r.planItemId,
    note: r.note,
    addedLate: r.addedLate,
    clientUpdatedAt: r.clientUpdatedAt.toISOString(),
    deleted: !!r.deletedAt,
  };
}

export function weightDto(r: WeightRow): WeightEntryDto {
  return { id: r.id, date: r.date, weightKg: r.weightKg, note: r.note, addedLate: r.addedLate, clientUpdatedAt: r.clientUpdatedAt.toISOString(), deleted: !!r.deletedAt };
}
