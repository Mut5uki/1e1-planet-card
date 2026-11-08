/**
 * 联机传输层：WebSocket 中继（跨设备 / 公网）
 * 对外 API：connectRoom(room, { onMessage, onError?, onReady? }) → { room, send, close, ready }
 *
 * 公网部署后默认连当前页面同源 /ws?room=CODE（Cloudflare Worker）。
 * 覆盖：?relay=wss://host/ws 或 localStorage planet-relay
 */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 公网中继（Cloudflare）。打开 workers 页时走同源；本地/其它托管则回落到这里 */
export const PUBLIC_RELAY_BASE =
  "wss://planet-cards-web.pages.dev/ws";

export function createRoomCode(len = 4) {
  let s = "";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) s += CODE_CHARS[arr[i] % CODE_CHARS.length];
  return s;
}

function withRoom(url, room) {
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.href : undefined);
    if (!u.searchParams.get("room")) u.searchParams.set("room", room);
    return u.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}room=${encodeURIComponent(room)}`;
  }
}

/** @param {string} [room] */
export function defaultRelayUrl(room = "") {
  let base = "";
  try {
    const q = new URLSearchParams(location.search).get("relay");
    if (q) base = q;
  } catch {
    /* ignore */
  }
  if (!base) {
    try {
      base = localStorage.getItem("planet-relay") || "";
    } catch {
      /* ignore */
    }
  }
  // 优先同源（已部署到 CF / 本地 npm start 都带 /ws）
  if (!base && typeof location !== "undefined" && /^https?:$/.test(location.protocol)) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    base = `${proto}//${location.host}/ws`;
  }
  if (!base && PUBLIC_RELAY_BASE) base = PUBLIC_RELAY_BASE;
  if (!base) base = "ws://127.0.0.1:5173/ws";

  return room ? withRoom(base, room) : base;
}

/**
 * @param {string} room
 * @param {{
 *   onMessage: (msg: any) => void,
 *   onError?: (err: Error) => void,
 *   onReady?: () => void,
 * }} handlers
 * @param {{ relayUrl?: string, timeoutMs?: number }} [opts]
 */
export function connectRoom(room, handlers, opts = {}) {
  const id = String(room || "").trim().toUpperCase();
  if (!id) throw new Error("empty-room");

  const url = opts.relayUrl || defaultRelayUrl(id);
  const timeoutMs = opts.timeoutMs ?? 10000;
  const queue = [];
  let joined = false;
  let closed = false;
  let settleReady;

  const ready = new Promise((resolve, reject) => {
    settleReady = { resolve, reject };
  });

  const ws = new WebSocket(url);

  const fail = (err) => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    settleReady?.reject(err);
    handlers.onError?.(err);
  };

  const timer = setTimeout(() => {
    if (!joined) fail(new Error("relay-timeout"));
  }, timeoutMs);

  ws.addEventListener("open", () => {
    if (closed) return;
    // DO / 本地中继都会在进房后回 _joined；再发一次 _join 兼容旧服
    ws.send(JSON.stringify({ type: "_join", room: id, t: Date.now() }));
  });

  ws.addEventListener("message", (ev) => {
    let data;
    try {
      data = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;

    if (typeof data.type === "string" && data.type.startsWith("_")) {
      if (data.type === "_joined") {
        if (!data.ok) {
          fail(new Error(data.error || "join-failed"));
          return;
        }
        if (joined || closed) return;
        joined = true;
        clearTimeout(timer);
        for (const raw of queue) ws.send(raw);
        queue.length = 0;
        settleReady?.resolve();
        handlers.onReady?.();
        return;
      }
      if (data.type === "_error") {
        handlers.onError?.(new Error(data.error || "relay-error"));
      }
      return;
    }

    if (data.room && data.room !== id) return;
    try {
      handlers.onMessage(data);
    } catch (err) {
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  });

  ws.addEventListener("error", () => {
    if (!joined) fail(new Error("relay-unreachable"));
  });

  ws.addEventListener("close", () => {
    clearTimeout(timer);
    if (!joined && !closed) {
      fail(new Error("relay-closed"));
      return;
    }
    closed = true;
  });

  return {
    room: id,
    relayUrl: url,
    ready,
    send(msg) {
      if (closed) return;
      const raw = JSON.stringify({ ...msg, room: id, t: Date.now() });
      if (!joined || ws.readyState !== WebSocket.OPEN) {
        queue.push(raw);
        return;
      }
      ws.send(raw);
    },
    close() {
      closed = true;
      clearTimeout(timer);
      queue.length = 0;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    },
  };
}
