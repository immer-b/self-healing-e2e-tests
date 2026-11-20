import { describe, expect, it } from 'vitest';
import request from 'supertest';
import express, { type Router } from 'express';
import { createClock } from '../../../src/server/hotel/clock';
import { createHotel } from '../../../src/server/hotel/hotel';
import { hotelRoutes } from '../../../src/server/hotel/routes';
import { openApiDocument } from '../../../src/server/hotel/openapi';

/** Every (method, path) the router actually serves, in OpenAPI path syntax. */
function routerOperations(router: Router) {
  const ops: string[] = [];
  for (const layer of (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack) {
    if (!layer.route) continue;
    const path = layer.route.path.replace(/:(\w+)/g, '{$1}');
    for (const method of Object.keys(layer.route.methods)) ops.push(`${method.toUpperCase()} ${path}`);
  }
  return ops.sort();
}

const specOperations = () =>
  Object.entries(openApiDocument().paths)
    .flatMap(([path, item]) => Object.keys(item as object).map((method) => `${method.toUpperCase()} ${path}`))
    .sort();

describe('OpenAPI description', () => {
  const router = hotelRoutes(createHotel({ clock: createClock(new Date('2026-11-20T08:00:00')) }));

  it('documents exactly the routes the server has', () => {
    expect(specOperations()).toEqual(routerOperations(router));
  });

  it('gives every operation a summary, tags and at least one response', () => {
    for (const [path, item] of Object.entries(openApiDocument().paths)) {
      for (const [method, op] of Object.entries(item as Record<string, { summary?: string; tags?: string[]; responses?: object }>)) {
        expect(op.summary, `${method} ${path}`).toBeTruthy();
        expect(op.tags?.length, `${method} ${path}`).toBeGreaterThan(0);
        expect(Object.keys(op.responses ?? {}).length, `${method} ${path}`).toBeGreaterThan(0);
      }
    }
  });

  it('only references schemas it defines', () => {
    const doc = openApiDocument();
    const refs = [...JSON.stringify(doc).matchAll(/"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1]);
    for (const ref of new Set(refs)) expect(doc.components.schemas, ref).toHaveProperty(ref);
  });

  it('is served without signing in', async () => {
    const app = express().use('/api/hotel', router);
    const res = await request(app).get('/api/hotel/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ openapi: '3.1.0', info: { title: 'Willow Pet Hotel API' } });
  });
});
