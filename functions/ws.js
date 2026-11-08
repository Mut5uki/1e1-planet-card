/**
 * Pages Function：WebSocket 房间 → 绑定到 Worker 里的 GameRoom DO
 */
export async function onRequest(context) {
  const { request, env } = context;
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 426 });
  }
  const url = new URL(request.url);
  const room = String(url.searchParams.get("room") || "")
    .trim()
    .toUpperCase();
  if (!room) {
    return new Response("room query required", { status: 400 });
  }
  if (!env.ROOMS) {
    return new Response("ROOMS binding missing", { status: 500 });
  }
  const id = env.ROOMS.idFromName(room);
  return env.ROOMS.get(id).fetch(request);
}
