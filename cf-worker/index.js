/**
 * Cloudflare Worker：静态资源 + Durable Object 房间中继
 * 客户端：wss://<host>/ws?room=CODE
 */

export class GameRoom {
  /** @param {DurableObjectState} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const url = new URL(request.url);
    const room = String(url.searchParams.get("room") || "")
      .trim()
      .toUpperCase();
    if (!room) {
      return new Response("room required", { status: 400 });
    }
    const intent = String(url.searchParams.get("intent") || "")
      .trim()
      .toLowerCase();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ room });

    const peers = this.ctx.getWebSockets().length;
    // join：房间里必须已有人（房主已创建），否则视为房间不存在
    if (intent === "join" && peers < 2) {
      server.send(
        JSON.stringify({
          type: "_joined",
          ok: false,
          error: "room-missing",
          room,
          t: Date.now(),
        })
      );
      server.close(1008, "room-missing");
      return new Response(null, { status: 101, webSocket: client });
    }
    // 前两人入座对弈，第三人起观战；设上限防滥用
    if (peers > 16) {
      server.send(
        JSON.stringify({
          type: "_joined",
          ok: false,
          error: "room-full",
          room,
          t: Date.now(),
        })
      );
      server.close(1013, "room-full");
      return new Response(null, { status: 101, webSocket: client });
    }

    server.send(
      JSON.stringify({
        type: "_joined",
        ok: true,
        room,
        peers,
        t: Date.now(),
      })
    );
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    let raw = message;
    if (typeof raw !== "string") {
      raw = new TextDecoder().decode(raw);
    }
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;

    const att = ws.deserializeAttachment() || {};
    const room = att.room || "";

    if (msg.type === "_join") {
      ws.send(
        JSON.stringify({
          type: "_joined",
          ok: true,
          room,
          peers: this.ctx.getWebSockets().length,
          t: Date.now(),
        })
      );
      return;
    }
    if (msg.type === "_ping") {
      ws.send(JSON.stringify({ type: "_pong", t: Date.now() }));
      return;
    }

    if (
      msg.type === "hello" ||
      msg.type === "join" ||
      msg.type === "spectate-hello" ||
      msg.type === "leave"
    ) {
      const role =
        msg.type === "spectate-hello"
          ? "spectator"
          : msg.role || att.role || null;
      const seat =
        msg.seat === 0 || msg.seat === 1
          ? msg.seat
          : att.seat === 0 || att.seat === 1
            ? att.seat
            : null;
      ws.serializeAttachment({
        room: room || msg.room || "",
        role,
        seat,
      });
    }

    const out = JSON.stringify({ ...msg, room: msg.room || room });
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== ws) {
        try {
          peer.send(out);
        } catch {
          /* ignore */
        }
      }
    }
  }

  webSocketClose(ws) {
    this.notifyLeave(ws);
  }

  webSocketError(ws) {
    this.notifyLeave(ws);
  }

  notifyLeave(ws) {
    const att = ws.deserializeAttachment() || {};
    const leaveMsg = JSON.stringify({
      type: "leave",
      room: att.room || "",
      role: att.role || null,
      seat: att.seat === 0 || att.seat === 1 ? att.seat : null,
      t: Date.now(),
      via: "disconnect",
    });
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== ws) {
        try {
          peer.send(leaveMsg);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

export default {
  /**
   * @param {Request} request
   * @param {{ ROOMS: DurableObjectNamespace, ASSETS: Fetcher }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const room = String(url.searchParams.get("room") || "")
        .trim()
        .toUpperCase();
      if (!room) {
        return new Response("room query required", { status: 400 });
      }
      const id = env.ROOMS.idFromName(room);
      return env.ROOMS.get(id).fetch(request);
    }

    if (url.pathname === "/health") {
      return new Response("ok", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
