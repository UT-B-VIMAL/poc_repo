const WebSocket = require("ws");
const { verifySocketToken } = require("../utils/jwt");
const { isTokenBlacklisted } = require("../utils/tokenBlacklist");
const {
  createTicket,
  updateTicket,
  deleteTicket,
  moveTicket,
  getAllTickets,
  getTicketsByUser
} = require("../modals/ticket.model");

module.exports.createServer = function() {
  const wss = new WebSocket.Server({ noServer: true });
  const boards = new Map(); // boardId => Map(userId => Set(ws))

  wss.on("connection", (ws) => {
    ws.isAlive = true;
    ws.userId = null;
    ws.boardId = null;

    console.log("🔌 Kanban WS connected");

    ws.on("ping", () => { ws.isAlive = true; });
    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw);
        await handleMessage(ws, msg);
      } catch (err) {
        console.error("Invalid Kanban WS message:", err);
      }
    });
    ws.on("close", () => {
      console.log("❌ Kanban WS disconnected");
      cleanup(ws);
    });
    ws.on("error", (err) => {
      console.error("Kanban WS error:", err);
      cleanup(ws);
    });
  });

  // HEARTBEAT
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));

  // MESSAGE HANDLER
  async function handleMessage(ws, { type, payload }) {
    if (type === "JOIN_BOARD") return authenticateAndJoin(ws, payload);
    if (!ws.userId || !ws.boardId) return ws.close(4001, "Unauthorized");

    if (type === "PING") return ws.send(JSON.stringify({ type: "PONG" }));
    if (type === "LEAVE_BOARD") { cleanup(ws); return ws.send(JSON.stringify({ type: "LEFT_BOARD" })); }
    if (type === "GET_USERS") {
      const board = boards.get(ws.boardId);
      const users = board ? Array.from(board.keys()) : [];
      return ws.send(JSON.stringify({ type: "BOARD_USERS", payload: { boardId: ws.boardId, users } }));
    }
    if (type === "GET_ALL_USERS") {
      const allBoards = [];
      boards.forEach((boardMap, boardId) => {
        const users = Array.from(boardMap.keys());
        allBoards.push({ boardId, users });
      });
      return ws.send(JSON.stringify({ type: "ALL_BOARD_USERS", payload: allBoards }));
    }

    // Kanban Events
    switch (type) {
      case "CREATE_CARD": return handleCreateCard(ws, payload);
      case "UPDATE_CARD": return handleUpdateCard(ws, payload);
      case "DELETE_CARD": return handleDeleteCard(ws, payload);
      case "MOVE_CARD": return handleMoveCard(ws, payload);
      case "GET_ALL_TICKETS": return handleGetAllTickets(ws);
      case "GET_USER_TICKETS": return handleGetUserTickets(ws);
      default: return ws.send(JSON.stringify({ type: "ERROR", message: "Unknown socket event" }));
    }
  }

  // AUTH + JOIN BOARD
  function authenticateAndJoin(ws, { boardId, token }) {
    try {
      if (!token) throw new Error("Token missing");
      if (isTokenBlacklisted(token)) throw new Error("Token revoked");

      const decoded = verifySocketToken(token);
      ws.userId = decoded.userId;
      ws.boardId = boardId;

      if (!boards.has(boardId)) boards.set(boardId, new Map());
      if (!boards.get(boardId).has(ws.userId)) boards.get(boardId).set(ws.userId, new Set());
      boards.get(boardId).get(ws.userId).add(ws);

      ws.send(JSON.stringify({ type: "AUTH_SUCCESS", payload: { boardId, userId: ws.userId } }));
    } catch (err) {
      console.error("AUTH failed:", err);
      ws.send(JSON.stringify({ type: "AUTH_FAILED", message: "Invalid or expired token" }));
      ws.close();
    }
  }

  // CLEANUP
  function cleanup(ws) {
    const { boardId, userId } = ws;
    if (!boardId || !userId) return;

    const board = boards.get(boardId);
    if (!board) return;

    const sockets = board.get(userId);
    if (!sockets) return;

    sockets.delete(ws);
    if (sockets.size === 0) board.delete(userId);
    if (board.size === 0) boards.delete(boardId);
  }

  // BROADCAST
  function broadcast(ws, type, payload) {
    const board = boards.get(ws.boardId);
    if (!board) return;

    const message = JSON.stringify({ type, payload });
    board.forEach(sockets => {
      sockets.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
      });
    });
  }

  // KANBAN HANDLERS
  async function handleCreateCard(ws, payload) {
    try {
      const { title, status_id } = payload;
      if (!title || !status_id) return ws.send(JSON.stringify({ type: "ERROR", message: "Missing title or status" }));

      const card = await createTicket({ title, status_id, userId: ws.userId });
      broadcast(ws, "CARD_CREATED", card);
    } catch (err) { console.error(err); ws.send(JSON.stringify({ type: "ERROR", message: "Failed to create card" })); }
  }

  async function handleUpdateCard(ws, payload) {
    try {
      const { id, title, status_id } = payload;
      if (!id || !title || status_id === undefined) return ws.send(JSON.stringify({ type: "ERROR", message: "Missing update data" }));

      const card = await updateTicket({ id, title, status_id, userId: ws.userId });
      broadcast(ws, "CARD_UPDATED", card);
    } catch (err) { console.error(err); ws.send(JSON.stringify({ type: "ERROR", message: "Update failed" })); }
  }

  async function handleDeleteCard(ws, payload) {
    try {
      const { id } = payload;
      if (!id) return ws.send(JSON.stringify({ type: "ERROR", message: "Missing card id" }));

      await deleteTicket({ id });
      broadcast(ws, "CARD_DELETED", { id });
    } catch (err) { console.error(err); ws.send(JSON.stringify({ type: "ERROR", message: "Delete failed" })); }
  }

  async function handleMoveCard(ws, payload) {
    try {
      const { id, status_id } = payload;
      if (!id || status_id === undefined) return ws.send(JSON.stringify({ type: "ERROR", message: "Missing move data" }));

      const card = await moveTicket({ id, status_id, userId: ws.userId });
      broadcast(ws, "CARD_MOVED", card);
    } catch (err) { console.error(err); ws.send(JSON.stringify({ type: "ERROR", message: "Move failed" })); }
  }

  async function handleGetAllTickets(ws) {
    try {
      const tickets = await getAllTickets();
      ws.send(JSON.stringify({ type: "ALL_TICKETS", payload: tickets }));
    } catch (err) { console.error(err); ws.send(JSON.stringify({ type: "ERROR", message: "Failed to fetch tickets" })); }
  }

  async function handleGetUserTickets(ws) {
    try {
      const tickets = await getTicketsByUser(ws.userId);
      ws.send(JSON.stringify({ type: "USER_TICKETS", payload: tickets }));
    } catch (err) { console.error(err); ws.send(JSON.stringify({ type: "ERROR", message: "Failed to fetch tickets" })); }
  }

  return wss;
};
