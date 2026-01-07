const express = require("express");
const { generateToken } = require("../utils/jwt");
const { blacklistToken } = require("../utils/tokenBlacklist");
const db = require("../utils/db");
const router = express.Router();

/* ============================= */
/* LOGIN */
/* ============================= */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    // Query user by name
    const [rows] = await db.execute(
      "SELECT id, name, email, password FROM users WHERE name = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "User not found" });
    }

    const user = rows[0];

    // POC: plain text password check
    if (user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken({
      userId: user.id,
      name: user.name,
      email: user.email,
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        userId: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



/* ============================= */
/* LOGOUT */
/* ============================= */
router.post("/logout", (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(400).json({ message: "Token missing" });
  }

  const token = authHeader.split(" ")[1];
  blacklistToken(token);

  res.json({ message: "Logged out successfully" });
});

router.get("/list", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT id, name, email FROM users"
    );
    res.json({ users: rows });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/search", async (req, res) => {
  try {
    const search = req.query.q || "";

    const [rows] = await db.execute(
      `
      SELECT id, name, email
      FROM users
      WHERE name LIKE ?
      ORDER BY name
      LIMIT 10
      `,
      [`%${search}%`]
    );

    res.json(rows);
  } catch (err) {
    console.error("User search error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
