import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationBellEventsForUser } from '../src/lib/queries';
import { startPresenceHeartbeat } from '../src/lib/presence-heartbeat';

describe('lightweight notification bell feed', () => {
  it('scopes to a single recipient and only reads the 20 event fields needed by the bell', () => {
    const userId = '00000000-0000-4000-8000-000000000044';
    const query = notificationBellEventsForUser(userId).toSQL();
    expect(query.params).toEqual([userId, 20]);
    expect(query.sql).toContain('"notifications"."user_id" = $1');
    expect(query.sql).toContain('"notifications"."created_at" desc');
    expect(query.sql).toContain('"notifications"."id" desc');
    for (const needed of ['"id"', '"type"', '"link"', '"created_at"']) expect(query.sql).toContain(needed);
    for (const expensive of ['"body"', '"title"', '"applicants"', '"applications"', '"agencies"']) {
      expect(query.sql).not.toContain(expensive);
    }
  });
});

describe('bounded presence heartbeat', () => {
  let visible: string;
  let listeners: Set<() => void>;
  let fetcher: ReturnType<typeof vi.fn>;
  let dispose: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    visible = 'visible';listeners = new Set();fetcher = vi.fn();
    vi.stubGlobal('document', {
      get visibilityState() { return visible; },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    });
    vi.stubGlobal('fetch', fetcher);
  });
  afterEach(() => { dispose?.();dispose = undefined;vi.useRealTimers();vi.unstubAllGlobals(); });

  it('limits presence to one in-flight request and one heartbeat per minute', async () => {
    let complete!: (response: Response) => void;
    fetcher.mockImplementation(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const onOnline = vi.fn();const onUnavailable = vi.fn();
    dispose = startPresenceHeartbeat(onOnline,onUnavailable);
    await vi.advanceTimersByTimeAsync(45_000);
    for (const changed of listeners) changed();
    expect(fetcher).toHaveBeenCalledTimes(1);
    complete(new Response(JSON.stringify({ online: 50 }),{ status: 200 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onOnline).toHaveBeenCalledWith(50);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it('pauses while hidden and stops all future heartbeats when unmounted', async () => {
    visible = 'hidden';
    fetcher.mockResolvedValue(new Response('{}',{status:200}));
    dispose = startPresenceHeartbeat(vi.fn(),vi.fn());
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetcher).not.toHaveBeenCalled();
    visible = 'visible';for (const changed of listeners) changed();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    dispose();dispose = undefined;
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it('times out a stalled heartbeat before the next scheduled minute', async () => {
    fetcher.mockImplementation((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('synthetic abort','AbortError')));
    }));
    const unavailable = vi.fn();
    dispose = startPresenceHeartbeat(vi.fn(),unavailable);
    const signal = (fetcher.mock.calls[0]![1] as RequestInit).signal!;
    await vi.advanceTimersByTimeAsync(19_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect(unavailable).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate a completed heartbeat on rapid visibility changes', async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ online: 50 }),{status:200}));
    dispose = startPresenceHeartbeat(vi.fn(),vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    visible = 'hidden';for (const changed of listeners) changed();
    visible = 'visible';for (const changed of listeners) changed();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
