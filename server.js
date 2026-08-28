const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("WebRTC Signaling Server is running");
});

const wss = new WebSocket.Server({
  server
});

const rooms = new Map();

function createId() {
  return crypto.randomBytes(8).toString("hex");
}

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on("connection", (ws) => {

  ws.id = createId();
  ws.room = null;
  ws.role = null;

  send(ws, {
    type: "connected",
    id: ws.id
  });

  ws.on("message", (raw) => {

    let message;

    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      return;
    }

    if (message.type === "join") {

      const roomId =
        String(message.room || "").trim();

      if (!roomId) {
        send(ws, {
          type: "error",
          message: "Room ID kosong"
        });
        return;
      }

      ws.room = roomId;

      ws.role =
        message.role === "host"
          ? "host"
          : "viewer";

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      const room = rooms.get(roomId);

      room.add(ws);

      send(ws, {
        type: "joined",
        room: roomId,
        id: ws.id
      });

      if (ws.role === "viewer") {

        room.forEach((client) => {

          if (
            client !== ws &&
            client.role === "host"
          ) {

            send(client, {
              type: "viewer-joined",
              id: ws.id
            });

          }

        });

      }

      return;
    }

    if (
      message.type === "offer" ||
      message.type === "answer" ||
      message.type === "ice"
    ) {

      const room =
        rooms.get(ws.room);

      if (!room) return;

      let target = null;

      room.forEach((client) => {

        if (client.id === message.target) {
          target = client;
        }

      });

      if (!target) return;

      send(target, {
        ...message,
        from: ws.id
      });

      return;
    }

    if (message.type === "host-ready") {

      const room =
        rooms.get(ws.room);

      if (!room) return;

      room.forEach((client) => {

        if (
          client !== ws &&
          client.role === "viewer"
        ) {

          send(ws, {
            type: "viewer-joined",
            id: client.id
          });

        }

      });

    }

  });

  ws.on("close", () => {

    if (!ws.room) return;

    const room =
      rooms.get(ws.room);

    if (!room) return;

    room.delete(ws);

    room.forEach((client) => {

      send(client, {
        type: "peer-left",
        id: ws.id
      });

    });

    if (room.size === 0) {
      rooms.delete(ws.room);
    }

  });

});

server.listen(PORT, "0.0.0.0", () => {

  console.log(
    `WebRTC server running on port ${PORT}`
  );

});
