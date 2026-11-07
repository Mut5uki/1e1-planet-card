/**
 * 静态页 + WebSocket 房间中继（最多 2 人/房）
 * 用法：npm start  →  http://本机IP:5173
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map();

function safePath(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  const rel = decoded === "/" ? "/index.html" : decoded;
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) return null;
  return full;
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Error");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/ws")) {
    res.writeHead(426, { "Content-Type": "text/plain" });
    res.end("WebSocket only");
    return;
  }
  const filePath = safePath(req.url || "/");
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) {
      sendFile(res, path.join(filePath, "index.html"));
      return;
    }
    sendFile(res, filePath);
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });

function roomOf(ws) {
  return ws.__room || null;
}

function leaveRoom(ws, { notify = true } = {}) {
  const id = roomOf(ws);
  if (!id) return;
  const set = rooms.get(id);
  if (!set) {
    ws.__room = null;
    return;
  }
  set.delete(ws);
  ws.__room = null;
  if (set.size === 0) {
    rooms.delete(id);
    return;
  }
  if (notify) {
    const leaveMsg = JSON.stringify({
      type: "leave",
      room: id,
      t: Date.now(),
      via: "disconnect",
    });
    for (const peer of set) {
      if (peer.readyState === 1) peer.send(leaveMsg);
    }
  }
}

function joinRoom(ws, roomId) {
  const id = String(roomId || "")
    .trim()
    .toUpperCase();
  if (!id) return { ok: false, error: "empty-room" };
  if (roomOf(ws) === id) return { ok: true, room: id, peers: rooms.get(id)?.size || 1 };

  leaveRoom(ws, { notify: true });

  let set = rooms.get(id);
  if (!set) {
    set = new Set();
    rooms.set(id, set);
  }
  if (set.size >= 2) return { ok: false, error: "room-full" };

  set.add(ws);
  ws.__room = id;
  return { ok: true, room: id, peers: set.size };
}

function relay(ws, raw) {
  let msg;
  try {
    msg = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(String(raw));
  } catch {
    return;
  }
  if (!msg || typeof msg !== "object") return;

  // 控制帧：进房（也可直接靠业务消息里的 room）
  if (msg.type === "_join" || msg.type === "_ping") {
    if (msg.type === "_join") {
      const result = joinRoom(ws, msg.room);
      ws.send(JSON.stringify({ type: "_joined", ...result, t: Date.now() }));
    } else {
      ws.send(JSON.stringify({ type: "_pong", t: Date.now() }));
    }
    return;
  }

  const id = String(msg.room || roomOf(ws) || "")
    .trim()
    .toUpperCase();
  if (!id) return;

  if (roomOf(ws) !== id) {
    const result = joinRoom(ws, id);
    if (!result.ok) {
      ws.send(JSON.stringify({ type: "_error", error: result.error, t: Date.now() }));
      return;
    }
  }

  const set = rooms.get(id);
  if (!set) return;
  const out = JSON.stringify({ ...msg, room: id });
  for (const peer of set) {
    if (peer !== ws && peer.readyState === 1) peer.send(out);
  }
}

wss.on("connection", (ws, req) => {
  ws.__room = null;
  ws.on("message", (data) => relay(ws, data.toString()));
  ws.on("close", () => leaveRoom(ws, { notify: true }));
  ws.on("error", () => leaveRoom(ws, { notify: true }));

  // 与 Cloudflare 一致：/ws?room=CODE 连上即进房
  try {
    const u = new URL(req.url || "/ws", "http://localhost");
    const room = String(u.searchParams.get("room") || "")
      .trim()
      .toUpperCase();
    if (room) {
      const result = joinRoom(ws, room);
      ws.send(JSON.stringify({ type: "_joined", ...result, t: Date.now() }));
    }
  } catch {
    /* ignore */
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[planet-cards] http://127.0.0.1:${PORT}`);
  console.log(`[planet-cards] LAN: http://<本机IP>:${PORT}`);
  console.log(`[planet-cards] WS   ${`ws://0.0.0.0:${PORT}/ws`}`);
});
