const WebSocket = require("ws");
const kanbanHandler = require("./kanban.socket");
const commentHandler = require("./comment.socket");

module.exports = (server) => {
  // create WS servers in noServer mode
  const wssKanban = new WebSocket.Server({ noServer: true });
  const wssComments = new WebSocket.Server({ noServer: true });

  // attach your existing handlers to these WS servers
  kanbanHandler(wssKanban);
  commentHandler(wssComments);

  // route WS connections by path
  server.on("upgrade", (request, socket, head) => {
    if (request.url.startsWith("/ws/kanban")) {
      wssKanban.handleUpgrade(request, socket, head, (ws) => {
        wssKanban.emit("connection", ws, request);
      });
    } else if (request.url.startsWith("/ws/comments")) {
      wssComments.handleUpgrade(request, socket, head, (ws) => {
        wssComments.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });
};
