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

  // Validation
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  // Static login check (POC only)
  if (username !== "Admin" || password !== "admin@123") {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  try {
    // Static user object
    const user = {
      id: 1,
      name: "Admin",
      email: "admin@example.com",
    };

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

module.exports = router;
