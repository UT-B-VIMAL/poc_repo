const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "POC_SECRET_KEY";
const JWT_EXPIRES_IN = "1h";

exports.generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

exports.verifySocketToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};
