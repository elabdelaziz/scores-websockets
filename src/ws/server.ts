import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { Match } from "../db/schema.ts";
import { wsArcjet } from "../security/arcjet.ts";

// Augment the WebSocket type to include the custom `isAlive` property
// used by the heartbeat/ping-pong pattern to detect dead connections.
declare module "ws" {
  interface WebSocket {
    isAlive: boolean;
  }
}
// ensure the socket is open before sending json.stringify
function sendJson(socket: WebSocket, payload: any) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcast(wss: WebSocketServer, payload: any) {
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

    sendJson(socket, { type: "welcome" });

    socket.on("error", console.error);
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
    broadcast(wss, { type: "match_created", data: match });
  }

  return { broadcastMatchCreated };
}
