import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {startNotificationPolling} from '../src/lib/notification-polling';

describe('bounded notification polling',()=>{
 let visible:string,listeners:Set<()=>void>,fetcher:ReturnType<typeof vi.fn>,dispose:(()=>void)|undefined;
 beforeEach(()=>{
  vi.useFakeTimers();visible='visible';listeners=new Set();fetcher=vi.fn();
  vi.stubGlobal('document',{get visibilityState(){return visible;},addEventListener:(_event:string,listener:()=>void)=>listeners.add(listener),removeEventListener:(_event:string,listener:()=>void)=>listeners.delete(listener)});
  vi.stubGlobal('fetch',fetcher);
 });
 afterEach(()=>{dispose?.();dispose=undefined;vi.useRealTimers();vi.unstubAllGlobals();});
 const changed=()=>{for(const listener of listeners)listener();};
 const response=(status=200)=>new Response(JSON.stringify({unread:2,events:[]}),{status,headers:{'content-type':'application/json'}});
 const requestSignal=()=>(fetcher.mock.calls[0]![1] as RequestInit).signal!;

 it('does not overlap a slow request with timer or visibility events',async()=>{
  fetcher.mockImplementation(()=>new Promise(()=>{}));
  dispose=startNotificationPolling(vi.fn());
  await vi.advanceTimersByTimeAsync(45_000);changed();changed();
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('keeps the successful visible cadence and publishes the payload',async()=>{
  fetcher.mockImplementation(async()=>response());const publish=vi.fn();dispose=startNotificationPolling(publish);
  await vi.advanceTimersByTimeAsync(0);expect(publish).toHaveBeenCalledWith({unread:2,events:[]});
  await vi.advanceTimersByTimeAsync(14_999);expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('waits for visibility and never polls while hidden',async()=>{
  visible='hidden';fetcher.mockImplementation(async()=>response());dispose=startNotificationPolling(vi.fn());
  await vi.advanceTimersByTimeAsync(60_000);expect(fetcher).not.toHaveBeenCalled();
  visible='visible';changed();await vi.advanceTimersByTimeAsync(0);expect(fetcher).toHaveBeenCalledTimes(1);
  visible='hidden';changed();await vi.advanceTimersByTimeAsync(60_000);expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('backs off failures without visibility events bypassing the retry delay',async()=>{
  fetcher.mockImplementation(async()=>response(503));dispose=startNotificationPolling(vi.fn());
  await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(15_000);
  changed();changed();await vi.advanceTimersByTimeAsync(0);expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15_000);expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(59_999);expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it.each([401,403])('stops after HTTP%s until a fresh authenticated mount',async status=>{
  fetcher.mockImplementation(async()=>response(status));dispose=startNotificationPolling(vi.fn());
  await vi.advanceTimersByTimeAsync(0);changed();await vi.advanceTimersByTimeAsync(120_000);
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('aborts the owned request and ignores late completion after unmount',async()=>{
  let complete!:(response:Response)=>void;fetcher.mockImplementation(()=>new Promise<Response>(resolve=>{complete=resolve;}));
  const publish=vi.fn();dispose=startNotificationPolling(publish);
  const signal=requestSignal();
  dispose();expect(signal.aborted).toBe(true);expect(listeners.size).toBe(0);
  complete(response());await vi.advanceTimersByTimeAsync(120_000);
  expect(publish).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('recovers from network failure and resets the delay after success',async()=>{
  fetcher.mockRejectedValueOnce(new Error('synthetic network failure')).mockImplementation(async()=>response());
  dispose=startNotificationPolling(vi.fn());await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(30_000);expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(15_000);expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it('bounds a hanging browser request before a delayed retry',async()=>{
  fetcher.mockImplementation((_url:string,options:RequestInit)=>new Promise((_resolve,reject)=>{
   options.signal!.addEventListener('abort',()=>reject(new DOMException('synthetic abort','AbortError')));
  }));
  dispose=startNotificationPolling(vi.fn());await vi.advanceTimersByTimeAsync(19_999);
  expect(requestSignal().aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);expect(requestSignal().aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(29_999);expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('caps repeated failure backoff at two minutes',async()=>{
  fetcher.mockImplementation(async()=>response(429));dispose=startNotificationPolling(vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  for(const delay of [30_000,60_000,120_000,120_000]){
   const previous=fetcher.mock.calls.length;await vi.advanceTimersByTimeAsync(delay-1);
   expect(fetcher).toHaveBeenCalledTimes(previous);await vi.advanceTimersByTimeAsync(1);
   expect(fetcher).toHaveBeenCalledTimes(previous+1);
  }
 });
});
