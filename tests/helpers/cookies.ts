import type { LightMyRequestResponse } from 'fastify';

export function cookieValue(res: LightMyRequestResponse, name: string): string | undefined {
  return res.cookies.find((cookie) => cookie.name === name)?.value;
}

export function cookieHeader(res: LightMyRequestResponse, names: string[]): string {
  return names
    .map((name) => [name, cookieValue(res, name)])
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}
