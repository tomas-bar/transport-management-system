/** Shared request contract for JSON commands and binary photo uploads. */
export function apiRequestOptions(method: string, input: unknown, csrf: string, raw = false): RequestInit {
  const unsafe = !['GET', 'HEAD'].includes(method);
  const payload = input === undefined && unsafe && !raw ? {} : input;
  return {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      ...(unsafe ? { 'X-CSRF-Token': csrf } : {}),
      ...(payload !== undefined ? { 'Content-Type': raw ? (payload as Blob).type : 'application/json' } : {}),
    },
    body: payload === undefined ? undefined : raw ? payload as Blob : JSON.stringify(payload),
  };
}
