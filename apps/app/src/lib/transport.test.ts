import {afterEach,describe,expect,it,vi} from 'vitest';
import {createTransport,type Connection} from './transport';
afterEach(()=>vi.useRealTimers());
describe('cold-start request safety',()=>{
  it('coalesces wake probes and sends each write once',async()=>{
    let finish!:(r:Response)=>void;const probe=new Promise<Response>(r=>finish=r);
    const send=vi.fn<typeof fetch>().mockImplementation(async url=>String(url).endsWith('/ready')?probe:new Response('{}'));
    const transport=createTransport('https://api.test',()=>{},send,()=>false);
    const first=transport('/auth/login',{method:'POST'});const second=transport('/auth/register',{method:'POST'});
    expect(send).toHaveBeenCalledTimes(1);finish(new Response('{}'));
    await Promise.all([first,second]);expect(send).toHaveBeenCalledTimes(3);
  });
  it('shows waking after delay and retries only the GET until the server is ready',async()=>{
    vi.useFakeTimers();const statuses:Connection[]=[];let probes=0;
    const send=vi.fn<typeof fetch>().mockImplementation(async url=>String(url).endsWith('/ready')?(++probes<6?new Response('',{status:503}):new Response('{}')):new Response('{}'));
    const transport=createTransport('https://api.test',s=>statuses.push(s),send,()=>false);const result=transport('/auth/register',{method:'POST'});
    await vi.advanceTimersByTimeAsync(6000);await result;
    expect(statuses).toContain('waking');expect(statuses.at(-1)).toBe('ready');expect(send.mock.calls.filter(([url])=>String(url).endsWith('/auth/register'))).toHaveLength(1);
  });
  it('does not retry an uncertain write response',async()=>{
    const send=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}')).mockRejectedValueOnce(new Error('connection lost'));
    await expect(createTransport('https://api.test',()=>{},send,()=>false)('/households',{method:'POST'})).rejects.toThrow('could not be confirmed');expect(send).toHaveBeenCalledTimes(2);
  });
  it('recognizes an explicitly offline device without attempting requests',async()=>{
    const send=vi.fn<typeof fetch>();const states:Connection[]=[];
    await expect(createTransport('https://api.test',s=>states.push(s),send,()=>true)('/auth/login',{method:'POST'})).rejects.toThrow('offline');expect(states).toEqual(['offline']);expect(send).not.toHaveBeenCalled();
  });
  it('bounds wake failure and never sends the deferred mutation',async()=>{
    vi.useFakeTimers();const send=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status:503}));
    const result=createTransport('https://api.test',()=>{},send,()=>false)('/households',{method:'POST'});const check=expect(result).rejects.toThrow('taking longer');
    await vi.advanceTimersByTimeAsync(76000);await check;expect(send.mock.calls.every(([url])=>String(url).endsWith('/ready'))).toBe(true);
  });
});
