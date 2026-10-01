import type { ApiError as ApiErrorBody } from '@clubhouse/contracts';

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  requestId?: string;
  retryAfter?: number;
  constructor(body: Partial<ApiErrorBody> & { requestId?: string }, status: number, retryAfter?: number) {
    super(body.title ?? 'Request failed');
    this.status = status;
    this.code = body.code ?? 'error';
    this.fields = body.fields;
    this.requestId = body.requestId;
    this.retryAfter = retryAfter;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Couldn’t reach the server.');
  }
}

export interface HttpOptions {
  baseUrl?: string;
  onUnauthorized?: (err: ApiError) => void;
  fetchImpl?: typeof fetch;
}

let options: HttpOptions = { baseUrl: '/api' };
export function configure(o: HttpOptions) {
  options = { ...options, ...o };
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function request<T>(method: string, path: string, init: { body?: unknown; query?: Query; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const f = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = { 'x-clubhouse-client': 'web', accept: 'application/json' };
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await f(`${options.baseUrl}${path}${qs(init.query)}`, { method, headers, body, credentials: 'include', signal: init.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new NetworkError();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  let isJson = true;
  try {
    data = text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    isJson = false;
  }
  // Our API always answers errors with problem+json carrying a `code`. Anything else came from a proxy or gateway
  // (API not running, deploy in progress, Vercel error page), which for the person means "couldn't reach the server".
  const fromApi = isJson && !!data && typeof data === 'object' && 'code' in data;
  if (!res.ok && !fromApi) throw new NetworkError();
  if (!isJson) throw new NetworkError();
  if (!res.ok) {
    const err = new ApiError((data ?? {}) as Partial<ApiErrorBody>, res.status, Number(res.headers.get('retry-after')) || undefined);
    if (res.status === 401 && options.onUnauthorized) options.onUnauthorized(err);
    throw err;
  }
  return data as T;
}

export const get = <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal });
export const post = <T>(path: string, body?: unknown) => request<T>('POST', path, { body: body ?? {} });
export const put = <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} });
export const patch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} });
export const del = <T>(path: string, body?: unknown) => request<T>('DELETE', path, body === undefined ? {} : { body });
export const upload = <T>(path: string, form: FormData) => request<T>('POST', path, { form });
export const url = (path: string, query?: Query) => `${options.baseUrl}${path}${qs(query)}`;
