const kanbanSocket = require("./kanban.socket");

module.exports = (server) => {
  kanbanSocket(server);
};
