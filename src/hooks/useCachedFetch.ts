"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type CacheEntry<T> = {
  value: T;
  updatedAt: number;
};

/**
 * 模块级缓存 —— 在组件卸载/重新挂载后依然保留已获取的数据。
 * 键为请求标识字符串，值为经 transform 处理后的响应及其写入时间。
 *
 * 之所以选择模块级 Map 而非 sessionStorage / localStorage：
 * - 无序列化开销，对大型数组（如上千条追踪数据）更高效
 * - 生命周期与 SPA 会话一致，在浏览器标签存活期间自动保持
 * - Next.js client component 的模块在页面间软导航时不会被重新加载
 */
const globalCache = new Map<string, CacheEntry<unknown>>();

function readCacheEntry<T>(key: string): CacheEntry<T> | undefined {
  return globalCache.get(key) as CacheEntry<T> | undefined;
}

function writeCacheEntry<T>(key: string, value: T): void {
  globalCache.set(key, { value, updatedAt: Date.now() });
}

function isCacheStale(entry: CacheEntry<unknown> | undefined, staleTimeMs: number | undefined): boolean {
  if (!entry) {
    return true;
  }

  if (staleTimeMs === undefined || staleTimeMs <= 0) {
    return true;
  }

  return Date.now() - entry.updatedAt >= staleTimeMs;
}

/**
 * useCachedFetch —— 带内存缓存 + 前台回归自动刷新的通用 HTTP 请求 Hook。
 *
 * 核心行为:
 * 1. 请求参数变化时，若缓存命中则立即返回已缓存数据（跳过 loading），同时后台静默刷新
 * 2. 缓存未命中时走常规 loading 流程
 * 3. 页面从后台切回前台（visibilitychange → visible）时自动静默刷新当前数据
 *
 * @param key        缓存键（传 null 则跳过请求）
 * @param url        请求地址（传 null 则跳过请求）
 * @param transform  将原始 JSON 响应转换为目标类型 T 的纯函数
 * @param options.refreshOnVisible  是否在切回前台时自动刷新（默认 true）
 * @param options.staleTimeMs       缓存保鲜时长。命中且未过期时，跳过挂载刷新与可见性刷新。
 * @param options.merge  合并策略函数，用于防止静默刷新覆盖实时推送的新数据。
 *                       当提供此函数时，HTTP 响应不会直接替换缓存，而是与当前缓存进行合并。
 *                       典型场景：WebSocket 在 HTTP 请求期间追加了新数据点，
 *                       若直接覆盖会导致新数据丢失（竞态回退）；通过 merge 可以
 *                       以 HTTP 响应为基准，保留缓存中时间戳更新的数据点。
 */
export function useCachedFetch<T>(
  key: string | null,
  url: string | null,
  transform?: (raw: unknown) => T,
  options?: { refreshOnVisible?: boolean; staleTimeMs?: number; merge?: (incoming: T, existing: T) => T }
): { data: T | null; loading: boolean; refresh: () => void } {
  const refreshOnVisible = options?.refreshOnVisible ?? true;

  // 懒初始化：组件首次渲染即可从缓存读取上一次的数据
  const [data, setData] = useState<T | null>(() => {
    if (key) {
      const cachedEntry = readCacheEntry<T>(key);
      if (cachedEntry) {
        return cachedEntry.value;
      }
    }

    return null;
  });
  const [loading, setLoading] = useState(false);

  // 使用 ref 持有最新值，避免 doFetch 的 useCallback 因依赖数组为空而产生 stale closure
  const keyRef = useRef(key);
  const urlRef = useRef(url);
  const transformRef = useRef(transform);
  const mergeRef = useRef(options?.merge);
  const staleTimeRef = useRef(options?.staleTimeMs);

  useEffect(() => {
    keyRef.current = key;
    urlRef.current = url;
    transformRef.current = transform;
    mergeRef.current = options?.merge;
    staleTimeRef.current = options?.staleTimeMs;
  }, [key, options?.merge, options?.staleTimeMs, transform, url]);

  const shouldRefresh = useCallback((currentKey: string) => {
    return isCacheStale(readCacheEntry(currentKey), staleTimeRef.current);
  }, []);

  /**
   * 发起一次 HTTP 请求并更新缓存。
   * @param silent 为 true 时不触发 loading 状态（用于后台静默刷新）
   *
   * 防竞态策略：当调用方提供了 merge 函数时，HTTP 响应不直接覆盖缓存，
   * 而是与当前缓存合并后再写入。这样即使请求飞行期间 WebSocket 已追加了
   * 新数据到缓存中，合并结果也会保留那些更新的数据点，避免回退。
   */
  const doFetch = useCallback((silent: boolean) => {
    // 从 ref 读取调用时刻的 key / url
    const currentKey = keyRef.current;
    const currentUrl = urlRef.current;
    if (!currentKey || !currentUrl) return;

    if (!silent) setLoading(true);

    fetch(currentUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((raw) => {
        // 如果请求期间 key 已经变了（用户切换了参数），丢弃本次结果
        if (keyRef.current !== currentKey) return;
        const result = transformRef.current ? transformRef.current(raw) : (raw as T);

        // 当存在 merge 策略且缓存中已有数据时，合并而非覆盖。
        // 这是防止前台恢复后 HTTP 静默刷新覆盖 WebSocket 已追加数据的关键逻辑。
        const mergeFn = mergeRef.current;
        const existing = readCacheEntry<T>(currentKey)?.value;
        if (mergeFn && existing !== undefined) {
          const merged = mergeFn(result, existing);
          writeCacheEntry(currentKey, merged);
          setData(merged);
        } else {
          writeCacheEntry(currentKey, result);
          setData(result);
        }
      })
      .catch((err) => {
        console.error(`[useCachedFetch] ${currentKey}:`, err);
      })
      .finally(() => {
        // 仅当 key 仍然匹配时才重置 loading，防止覆盖后续请求的状态
        if (keyRef.current === currentKey) setLoading(false);
      });
  }, []);

  // key / url 变化时：缓存命中 → 立即显示 + 后台静默刷新；未命中 → 常规 loading
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!key || !url) {
        setData(null);
        setLoading(false);
        return;
      }

      const cachedEntry = readCacheEntry<T>(key);
      if (cachedEntry !== undefined) {
        setData(cachedEntry.value);
        setLoading(false);
        if (shouldRefresh(key)) {
          doFetch(true); // 有缓存但已过保鲜期，静默刷新
        }
      } else {
        setData(null);
        setLoading(true);
        doFetch(false); // 无缓存，显示 loading
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [key, url, doFetch, shouldRefresh]);

  // 页面从后台切回前台时自动静默刷新
  useEffect(() => {
    if (!refreshOnVisible) return;

    const onVisibilityChange = () => {
      const currentKey = keyRef.current;
      if (document.visibilityState === "visible" && currentKey && shouldRefresh(currentKey)) {
        doFetch(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refreshOnVisible, doFetch, shouldRefresh]);

  const refresh = useCallback(() => doFetch(true), [doFetch]);

  return { data, loading, refresh };
}

/**
 * 手动更新指定缓存键的值（不触发 React 状态更新）。
 *
 * 典型用途：WebSocket 实时推送新数据后同步写入缓存，
 * 确保用户切换视图再切回时看到的缓存快照已包含实时追加的数据点。
 */
export function updateFetchCache<T>(key: string, updater: (prev: T | undefined) => T): void {
  const prev = readCacheEntry<T>(key)?.value;
  writeCacheEntry(key, updater(prev));
}
