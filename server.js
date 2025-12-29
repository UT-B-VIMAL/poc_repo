require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const setupSockets = require("./websockets/index");
const authRoutes = require("./routes/auth.routes");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

app.use("/api/auth", authRoutes);

const server = http.createServer(app);
setupSockets(server);

server.listen(5000, () => {
  console.log("Server running on port 5000");
});
