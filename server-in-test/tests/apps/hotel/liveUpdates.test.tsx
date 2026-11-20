// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { signInAs } from './harness';

/** Minimal EventSource stand-in: tests push events with FakeEventSource.emit(). */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, ((event: MessageEvent) => void)[]>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener() {}
  close() {
    this.closed = true;
  }
  static emit(data: unknown) {
    for (const source of FakeEventSource.instances.filter((s) => !s.closed)) {
      for (const fn of source.listeners.get('change') ?? []) fn(new MessageEvent('change', { data: JSON.stringify(data) }));
    }
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});
afterEach(() => vi.unstubAllGlobals());

describe('live updates', () => {
  it('refreshes the care schedule when a round changes elsewhere', async () => {
    const { hotel } = await signInAs('receiving', '/schedule');
    const rounds = await screen.findByRole('region', { name: /rounds/i });
    await within(rounds).findByRole('row', { name: /Morning.*Biscuit/ });
    expect(FakeEventSource.instances.some((s) => s.url === '/api/hotel/events')).toBe(true);

    const [task] = hotel.tasks.list({ date: '2026-11-20' }).filter((t) => t.petId === 'pet-1' && t.slot === 'morning');
    const jordan = { id: 'emp-3', name: 'Jordan Lee' };
    hotel.tasks.update(task.id, { cleaned: true, fed: true }, jordan);
    hotel.tasks.attachPhoto(task.id, 'pho-x', jordan);
    hotel.tasks.complete(task.id, jordan);
    act(() => FakeEventSource.emit({ entityType: 'task', entityId: task.id, action: 'complete' }));

    await waitFor(() => expect(within(rounds).getByRole('row', { name: /Morning.*Biscuit/ })).toHaveTextContent('Done'));
  });

  it('shows new rounds in a carer’s queue without pressing Refresh', async () => {
    const { hotel } = await signInAs('staff');
    await waitFor(() => expect(within(screen.getByRole('list', { name: /my rounds/i })).getAllByRole('listitem')).toHaveLength(3));
    const [extra] = hotel.tasks.list({ date: '2026-11-20', assigneeId: 'emp-4' });
    hotel.tasks.reassign(extra.id, 'emp-3', { id: 'emp-2', name: 'Priya Shah' });
    act(() => FakeEventSource.emit({ entityType: 'task', entityId: extra.id, action: 'reassign' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: /my rounds/i })).getAllByRole('listitem')).toHaveLength(4));
  });

  it('ignores changes to unrelated records and closes the stream when leaving', async () => {
    const { user, fetch } = await signInAs('receiving', '/schedule');
    await screen.findByRole('region', { name: /rounds/i });
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/tasks?'))).toBe(true));
    fetch.mockClear();
    act(() => FakeEventSource.emit({ entityType: 'room', entityId: 'room-1', action: 'update' }));
    await new Promise((r) => setTimeout(r, 400));
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/tasks?'))).toBe(false);
    await user.click(screen.getByRole('link', { name: 'Pets' }));
    await screen.findByRole('heading', { level: 1, name: 'Pets' });
    expect(FakeEventSource.instances.filter((s) => !s.closed)).toHaveLength(0);
  });
});
