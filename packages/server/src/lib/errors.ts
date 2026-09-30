import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class AppError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request', fields?: Record<string, string>) => new AppError(400, code, message, fields);
export const unauthorized = (message = 'Please sign in.', code = 'unauthorized') => new AppError(401, code, message);
export const forbidden = (message = 'You do not have access to that.', code = 'forbidden') => new AppError(403, code, message);
export const notFound = (message = 'Not found.', code = 'not_found') => new AppError(404, code, message);
export const conflict = (message: string, code = 'conflict') => new AppError(409, code, message);
export const gone = (message: string, code = 'gone') => new AppError(410, code, message);
export const tooMany = (message: string, retryAfterSec: number, code = 'rate_limited') =>
  new AppError(429, code, message, undefined, { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSec))) });
export const unprocessable = (message: string, code = 'unprocessable', fields?: Record<string, string>) => new AppError(422, code, message, fields);

export function assert(cond: unknown, err: AppError): asserts cond {
  if (!cond) throw err;
}
