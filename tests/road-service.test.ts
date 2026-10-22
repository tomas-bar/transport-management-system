import test from 'node:test';
import assert from 'node:assert/strict';
import { roadRoute } from '../src/services/maps.ts';

const stops = [{ id: 'a', name: 'A', address: '', lat: 54, lng: 23 }, { id: 'b', name: 'B', address: '', lat: 53, lng: 10 }];
test('road adapter rejects malformed distances and geometry instead of producing a false zero-cost comparison', async () => {
  const original = globalThis.fetch;
  try {
    for (const [index, route] of [
      { distance: 'unknown', duration: 10, geometry: { coordinates: [[23, 54], [10, 53]] } },
      { distance: 100, duration: -1, geometry: { coordinates: [[23, 54], [10, 53]] } },
      { distance: 100, duration: 10, geometry: { coordinates: [[23, 154], [10, 53]] } },
    ].entries()) {
      globalThis.fetch = async () => new Response(JSON.stringify({ code: 'Ok', routes: [route] }));
      await assert.rejects(roadRoute(stops, 'https://route-fixture.invalid/' + index), /netinkamus duomenis/);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 1200, duration: 90, geometry: { coordinates: [[23, 54], [10, 53]] } }] }));
    const route = await roadRoute(stops, 'https://route-fixture.invalid/valid');
    assert.equal(route.distance, 1200);
    assert.equal(route.duration, 90);
    assert.deepEqual(route.coordinates, [[54, 23], [53, 10]]);
  } finally { globalThis.fetch = original; }
});
