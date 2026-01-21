require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");

const kanbanSocket = require("./websockets/kanban.socket");
const commentSocket = require("./websockets/comment.socket");
const authRoutes = require("./routes/auth.routes");
const uploadRoutes = require("./routes/upload.routes");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.use("/api/auth", authRoutes);
app.use("/users",authRoutes);
app.use("/api", uploadRoutes);

const server = http.createServer(app);

// Create WS servers with noServer: true
const wssKanban = kanbanSocket.createServer(); // returns WS.Server
const wssComments = commentSocket.createServer();

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  console.log("Upgrade request URL:", request.url);      // Full URL including query
  console.log("Parsed pathname:", pathname);            // Path only

  if (pathname === "/ws/kanban") {
    console.log("Handling Kanban WS upgrade");
    wssKanban.handleUpgrade(request, socket, head, (ws) => {
      wssKanban.emit("connection", ws, request);
    });
  } else if (pathname === "/ws/comments") {
    console.log("Handling Comment WS upgrade");
    wssComments.handleUpgrade(request, socket, head, (ws) => {
      wssComments.emit("connection", ws, request);
    });
  } else {
    console.log("Unknown WS path, destroying socket");
    socket.destroy();
  }
});


