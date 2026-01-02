const WebSocket = require("ws");
const { verifySocketToken } = require("../utils/jwt");
const { isTokenBlacklisted } = require("../utils/tokenBlacklist");
const { createComment, getCommentsByTask } = require("../modals/comment.model");

module.exports.createServer = function() {
  const wss = new WebSocket.Server({ noServer: true });
  const tasks = new Map(); // taskId => Map(userId => Set(ws))

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.userId = null;
    ws.taskId = null;

    console.log("💬 Comment WS connected");
     ws.isCommentSocket = true;

    ws.on("pong", () => ws.isAlive = true);

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw);
        await handleMessage(ws, msg);
      } catch (err) {
        console.error("Invalid Comment WS message:", err);
      }
    });

    ws.on("close", () => cleanup(ws));
    ws.on("error", (err) => { console.error(err); cleanup(ws); });
  });

  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));
async function handleMessage(ws, { type, payload }) {
  console.log("📨 WS TYPE:", type);

  if (!ws.isCommentSocket) return;

  if (type === "JOIN_TASK") return authenticateAndJoin(ws, payload);

  if (!ws.userId || !ws.taskId) {
    console.log("❌ Unauthorized socket");
    return ws.close(4001, "Unauthorized");
  }

  switch (type) {
    case "GET_COMMENTS":
      console.log("📥 GET_COMMENTS triggered");
      return handleGetComments(ws);

    case "CREATE_COMMENT":
      return handleCreateComment(ws, payload);
  }
}


  function authenticateAndJoin(ws, { taskId, token }) {
    try {
      if (!token) throw new Error("Token missing");
      if (isTokenBlacklisted(token)) throw new Error("Token revoked");

      const decoded = verifySocketToken(token);
      ws.userId = decoded.userId;
      ws.taskId = taskId;

      if (!tasks.has(taskId)) tasks.set(taskId, new Map());
      if (!tasks.get(taskId).has(ws.userId)) tasks.get(taskId).set(ws.userId, new Set());
      tasks.get(taskId).get(ws.userId).add(ws);

      ws.send(JSON.stringify({ type: "AUTH_SUCCESS", payload: { taskId, userId: ws.userId } }));
    } catch (err) {
      console.error("Comment AUTH failed:", err);
      ws.send(JSON.stringify({ type: "AUTH_FAILED", message: "Invalid or expired token" }));
      ws.close();
    }
  }

  function cleanup(ws) {
    const { taskId, userId } = ws;
    if (!taskId || !userId) return;

    const task = tasks.get(taskId);
    if (!task) return;

    const sockets = task.get(userId);
    if (!sockets) return;

    sockets.delete(ws);
    if (sockets.size === 0) task.delete(userId);
    if (task.size === 0) tasks.delete(taskId);
  }

  function broadcast(ws, type, payload) {
    const task = tasks.get(ws.taskId);
    if (!task) return;

    const message = JSON.stringify({ type, payload });
    task.forEach(sockets => {
      sockets.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
      });
    });
  }

  async function handleGetComments(ws) {
    try {
      const comments = await getCommentsByTask(ws.taskId);
      console.log("📦 COMMENTS FROM DB:", comments);
      ws.send(JSON.stringify({ type: "COMMENTS_LIST", payload: comments }));
    } catch (err) {
      console.error(err);
      ws.send(JSON.stringify({ type: "ERROR", message: "Failed to load comments" }));
    }
  }

  async function handleCreateComment(ws, payload) {
    try {
      const { message } = payload;
      if (!message) return ws.send(JSON.stringify({ type: "ERROR", message: "Message is required" }));

      const comment = await createComment({ taskId: ws.taskId, userId: ws.userId, message });
      broadcast(ws, "COMMENT_CREATED", comment);
    } catch (err) {
      console.error(err);
      ws.send(JSON.stringify({ type: "ERROR", message: "Failed to create comment" }));
    }
  }

  return wss;
};
