import type { Context } from 'hono';
import type { z } from 'zod';
import { badRequest } from '../../lib/errors';

function fieldsOf(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join('.') || '_';
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

export async function jsonBody(ctx: Context): Promise<unknown> {
  try {
    return await ctx.req.json();
  } catch {
    throw badRequest('Send a JSON body.', 'invalid_json');
  }
}

/** Validate an already-read body (for endpoints that pick the schema from the payload). */
export function parseBody<T extends z.ZodType>(raw: unknown, schema: T): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const fields = fieldsOf(r.error);
    throw badRequest(Object.values(fields)[0] ?? 'Check the highlighted fields.', 'validation', fields);
  }
  return r.data;
}

export async function body<T extends z.ZodType>(ctx: Context, schema: T): Promise<z.infer<T>> {
  return parseBody(await jsonBody(ctx), schema);
}

export function query<T extends z.ZodType>(ctx: Context, schema: T): z.infer<T> {
  const r = schema.safeParse(ctx.req.query());
  if (!r.success) {
    const fields = fieldsOf(r.error);
    throw badRequest(Object.values(fields)[0] ?? 'Invalid query.', 'validation', fields);
  }
  return r.data;
}

export function param(ctx: Context, name: string, pattern = /^[0-9a-f-]{36}$/i): string {
  const v = ctx.req.param(name);
  if (!v || !pattern.test(v)) throw badRequest(`Invalid ${name}.`, 'invalid_param');
  return v;
}
