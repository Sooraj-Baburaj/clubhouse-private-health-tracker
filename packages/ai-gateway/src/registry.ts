import type { z } from 'zod';
import { AI_FEATURE_KEYS, type AiFeatureKey, type AiModel } from '@clubhouse/contracts';
import { DIET_DRAFT_SYSTEM, DietDraftInput, DietDraftOutput, buildDietDraftUser, mockDietDraft, sanitiseDietDraft } from './features/dietDraft';
import { FOOD_PHOTO_SYSTEM, FoodPhotoInput, buildFoodPhotoUser, mockFoodPhoto } from './features/foodPhoto';
import { FOOD_TEXT_SYSTEM, FoodTextInput, buildFoodTextUser, mockFoodText } from './features/foodText';
import { HOME_SUMMARY_SYSTEM, HomeSummaryInput, HomeSummaryOutput, buildHomeSummaryUser, mockHomeSummary, sanitiseHomeSummary } from './features/homeSummary';
import { PROGRESS_NARRATIVE_SYSTEM, ProgressNarrativeInput, ProgressNarrativeOutput, buildProgressNarrativeUser, mockNarrative, sanitiseNarrative } from './features/progressNarrative';
import { RecognitionWire, sanitiseRecognition } from './features/shared';

export type UserBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/webp' | 'image/jpeg' | 'image/png'; data: string } };

export interface FeatureDef<I, O> {
  key: AiFeatureKey;
  name: string;
  purpose: string;
  trigger: string;
  dataSent: string;
  fallback: string;
  defaultModel: AiModel;
  timeoutMs: number;
  maxTokens: number;
  effort: 'low' | 'medium';
  promptVersion: string;
  sourceFile: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  system: string;
  buildUser: (input: I) => UserBlock[];
  sanitise: (output: O, input: I) => O;
  mock: (input: I) => O;
  imageCount: (input: I) => number;
}

function def<I, O>(d: FeatureDef<I, O>): FeatureDef<I, O> {
  return d;
}

/**
 * SYS-AI-30 registry of every AI feature key. The Admin panel renders this (ADM-AI-20) from the generated
 * registry.json, and test/guards.test.ts fails when code calls an unregistered key.
 */
export const FEATURES = {
  'food.photo': def({
    key: 'food.photo',
    name: 'Food photo recognition',
    purpose: 'Recognise foods and portions in a meal photo so the member confirms instead of searching.',
    trigger: 'Member takes a photo in Log food (Snap a meal).',
    dataSent: 'The compressed photo (≤1024 px, EXIF stripped), meal slot and local time. No name, no history.',
    fallback: 'Search the food database with the photo attached.',
    defaultModel: 'claude-sonnet-5-5',
    timeoutMs: 20_000,
    maxTokens: 3000,
    effort: 'low',
    promptVersion: 'food.photo@1',
    sourceFile: 'packages/ai-gateway/src/features/foodPhoto.ts',
    input: FoodPhotoInput,
    output: RecognitionWire,
    system: FOOD_PHOTO_SYSTEM,
    buildUser: buildFoodPhotoUser,
    sanitise: sanitiseRecognition,
    mock: mockFoodPhoto,
    imageCount: () => 1,
  }),
  'food.text': def({
    key: 'food.text',
    name: 'Natural-language food entry',
    purpose: 'Split a typed meal description ("2 rotis and dal") into items with portions.',
    trigger: 'Member taps "Parse with AI" in food search.',
    dataSent: 'The typed text, meal slot and local time.',
    fallback: 'Plain database search for the typed words.',
    defaultModel: 'claude-sonnet-5-5',
    timeoutMs: 10_000,
    maxTokens: 2000,
    effort: 'low',
    promptVersion: 'food.text@1',
    sourceFile: 'packages/ai-gateway/src/features/foodText.ts',
    input: FoodTextInput,
    output: RecognitionWire,
    system: FOOD_TEXT_SYSTEM,
    buildUser: buildFoodTextUser,
    sanitise: sanitiseRecognition,
    mock: mockFoodText,
    imageCount: () => 0,
  }),
  'home.summary': def({
    key: 'home.summary',
    name: 'Daily summary and next meal',
    purpose: 'Phrase today’s numbers, the one thing to fix and the logic-chosen next meal in ≤3 sentences.',
    trigger: 'Today opened; at most hourly and 30 s after a new log.',
    dataSent: 'Compact JSON of today’s and this week’s numbers, first name, next-meal option name. No raw logs or images.',
    fallback: 'Logic status strip: remaining kcal, lowest nutrient, next-slot link.',
    defaultModel: 'claude-sonnet-5-5',
    timeoutMs: 10_000,
    maxTokens: 1200,
    effort: 'low',
    promptVersion: 'home.summary@1',
    sourceFile: 'packages/ai-gateway/src/features/homeSummary.ts',
    input: HomeSummaryInput,
    output: HomeSummaryOutput,
    system: HOME_SUMMARY_SYSTEM,
    buildUser: buildHomeSummaryUser,
    sanitise: sanitiseHomeSummary,
    mock: mockHomeSummary,
    imageCount: () => 0,
  }),
  'progress.narrative': def({
    key: 'progress.narrative',
    name: 'Forecast narrative',
    purpose: 'Two sentences explaining what drives the weight forecast.',
    trigger: 'Progress opened; cached per day.',
    dataSent: 'Forecast inputs: trend, weekly change, average net, TDEE, goal, top days by kcal.',
    fallback: 'Templated sentence from the logic engine.',
    defaultModel: 'claude-sonnet-5-5',
    timeoutMs: 10_000,
    maxTokens: 800,
    effort: 'low',
    promptVersion: 'progress.narrative@1',
    sourceFile: 'packages/ai-gateway/src/features/progressNarrative.ts',
    input: ProgressNarrativeInput,
    output: ProgressNarrativeOutput,
    system: PROGRESS_NARRATIVE_SYSTEM,
    buildUser: buildProgressNarrativeUser,
    sanitise: sanitiseNarrative,
    mock: mockNarrative,
    imageCount: () => 0,
  }),
  'diet.draft': def({
    key: 'diet.draft',
    name: 'Diet plan drafts',
    purpose: 'Draft a full five-slot plan for an admin to review and edit.',
    trigger: 'Admin clicks "Draft with AI" in the diet builder.',
    dataSent: 'Member targets, diet type, allergies, dislikes, cuisines, favourites, not-for-me options, admin brief, known food names.',
    fallback: 'Admin builds the plan by hand.',
    defaultModel: 'claude-sonnet-5-5',
    timeoutMs: 45_000,
    maxTokens: 12000,
    effort: 'medium',
    promptVersion: 'diet.draft@1',
    sourceFile: 'packages/ai-gateway/src/features/dietDraft.ts',
    input: DietDraftInput,
    output: DietDraftOutput,
    system: DIET_DRAFT_SYSTEM,
    buildUser: buildDietDraftUser,
    sanitise: (o, i) => sanitiseDietDraft(o, i.optionsPerSlot),
    mock: mockDietDraft,
    imageCount: () => 0,
  }),
} as const satisfies { [K in AiFeatureKey]: FeatureDef<any, any> };

export type Features = typeof FEATURES;
export type FeatureInput<K extends AiFeatureKey> = Features[K] extends FeatureDef<infer I, any> ? I : never;
export type FeatureOutput<K extends AiFeatureKey> = Features[K] extends FeatureDef<any, infer O> ? O : never;

export class UnregisteredFeatureError extends Error {
  constructor(key: string) {
    super(`AI feature "${key}" is not in the registry`);
  }
}

export function isRegistered(key: string): key is AiFeatureKey {
  return (AI_FEATURE_KEYS as readonly string[]).includes(key) && key in FEATURES;
}

export interface RegistryEntry {
  key: AiFeatureKey;
  name: string;
  purpose: string;
  trigger: string;
  dataSent: string;
  fallback: string;
  defaultModel: string;
  timeoutMs: number;
  promptVersion: string;
  sourceFile: string;
  system: string;
}

/** Serializable registry for the Admin panel (generated from code, never typed by hand). */
export function registryEntries(): RegistryEntry[] {
  return AI_FEATURE_KEYS.map((k) => {
    const f = FEATURES[k] as FeatureDef<unknown, unknown>;
    return { key: f.key, name: f.name, purpose: f.purpose, trigger: f.trigger, dataSent: f.dataSent, fallback: f.fallback, defaultModel: f.defaultModel, timeoutMs: f.timeoutMs, promptVersion: f.promptVersion, sourceFile: f.sourceFile, system: f.system };
  });
}
