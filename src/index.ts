import express from "express";
import { matchRouter } from "./routes/matches.ts";
import http from "http";
import { attachWebSocketServer } from "./ws/server.ts";
import { securityMiddleware } from "./security/arcjet.ts";

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
const server = http.createServer(app);

// Middleware to parse JSON bodies
app.use(express.json());

// Root GET route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to the Sportz API!" });
});

app.use(securityMiddleware());

app.use("/matches", matchRouter);

// explanation: destructuring the broadcastMatchCreated function from the attachWebSocketServer function so we can use it to broadcast match events to connected clients
const { broadcastMatchCreated } = attachWebSocketServer(server);

// explanation: app.locals is an object that is available to all routes, we can use it to store the broadcastMatchCreated function so we can access it in the match router
app.locals.broadcastMatchCreated = broadcastMatchCreated;

// Start the server
server.listen(PORT, HOST, () => {
  const baseUrl =
    HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  console.log(`Server is running at ${baseUrl}`);
  console.log(
    `WebSocket server is running at ${baseUrl.replace("http", "ws")}/ws`,
  );
});
