const { findUserById } = require("../data/usersStore");

function getTokenFromHeader(req) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.replace("Bearer ", "").trim();
}

function verifyToken(token) {
  if (!token || !token.startsWith("fake-token-")) {
    return null;
  }

  const userId = Number(token.replace("fake-token-", ""));

  if (!Number.isFinite(userId)) {
    return null;
  }

  return findUserById(userId) || null;
}

function requireAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({
      message: "Authentification requise."
    });
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const token = getTokenFromHeader(req);
  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({
      message: "Authentification requise."
    });
  }

  if (user.role !== "admin") {
    return res.status(403).json({
      message: "Accès admin requis."
    });
  }

  req.user = user;
  next();
}

module.exports = {
  requireAuth,
  requireAdmin
};