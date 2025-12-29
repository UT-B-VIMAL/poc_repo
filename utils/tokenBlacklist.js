const blacklistedTokens = new Set();

exports.blacklistToken = (token) => {
  blacklistedTokens.add(token);
};

exports.isTokenBlacklisted = (token) => {
  return blacklistedTokens.has(token);
};
