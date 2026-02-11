import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { Match } from "../db/schema.ts";
import { wsArcjet } from "../security/arcjet.ts";

const matchSubscribers = new Map<string, Set<WebSocket>>();

function subscribeToMatch(matchId: string, socket: WebSocket) {
  if (!matchSubscribers.has(matchId)) {
    matchSubscribers.set(matchId, new Set());
  }
  matchSubscribers.get(matchId)?.add(socket);
}

function unsubscribeFromMatch(matchId: string, socket: WebSocket) {
  const subscribers = matchSubscribers.get(matchId);
  if (subscribers) {
    subscribers.delete(socket);
    if (subscribers.size === 0) {
      matchSubscribers.delete(matchId);
    }
  }
}

function cleanupSubscriptions(socket: WebSocket) {
  for (const matchId of socket.subscriptions) {
    unsubscribeFromMatch(matchId, socket);
  }
}

function broadcastToMatch(matchId: string, payload: any) {
  const subscribers = matchSubscribers.get(matchId);
  if (subscribers) {
    const message = JSON.stringify(payload);
    subscribers.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    });
  }
}

function handleMessage(socket: WebSocket, data: any) {
  let message;
  try {
    message = JSON.parse(data.toString());
  } catch (error) {
    sendJson(socket, { type: "error", data: { message: "Invalid message" } });
    return;
  }
  if (message.type === "subscribe" && Number.isInteger(message.matchId)) {
    const matchIdStr = String(message.matchId);
    subscribeToMatch(matchIdStr, socket);
    socket.subscriptions.add(matchIdStr);
    sendJson(socket, {
      type: "subscribed",
      matchId: message.matchId,
    });
    return;
  }
  if (message.type === "unsubscribe" && Number.isInteger(message.matchId)) {
    const matchIdStr = String(message.matchId);
    unsubscribeFromMatch(matchIdStr, socket);
    socket.subscriptions.delete(matchIdStr);
    sendJson(socket, {
      type: "unsubscribed",
      matchId: message.matchId,
    });
    return;
  }
}

// Augment the WebSocket type to include the custom `isAlive` property
// used by the heartbeat/ping-pong pattern to detect dead connections.
declare module "ws" {
  interface WebSocket {
    isAlive: boolean;
    subscriptions: Set<string>;
  }
}
// ensure the socket is open before sending json.stringify
function sendJson(socket: WebSocket, payload: any) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcastToAll(wss: WebSocketServer, payload: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
}

export function attachWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1024 * 1024,
  });

  server.on("upgrade", async (req, socket, head) => {
    if (!req.url?.startsWith("/ws")) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }
    if (wsArcjet) {
      try {
        const decision = await wsArcjet.protect(req);
        if (decision.isDenied()) {
          const status = decision.reason.isRateLimit()
            ? "429 Too Many Requests"
            : "403 Forbidden";
          socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
          socket.destroy();
          return;
        }
      } catch (error) {
        console.error("ws connection error", error);
        socket.destroy();
        return;
      }
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (socket) => {
    socket.isAlive = true;
    socket.on("pong", () => {
      socket.isAlive = true;
    });

    socket.subscriptions = new Set();

    sendJson(socket, { type: "welcome" });

    socket.on("message", (data) => handleMessage(socket, data));
    socket.on("close", () => cleanupSubscriptions(socket));
    socket.on("error", () => socket.terminate());
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  function broadcastMatchCreated(match: Match) {
    broadcastToAll(wss, { type: "match_created", data: match });
  }

  function broadcastCommentary(matchId: string, comment: string) {
    broadcastToMatch(matchId, { type: "commentary", data: comment });
  }

  return { broadcastMatchCreated, broadcastCommentary };
}
