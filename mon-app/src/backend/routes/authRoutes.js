const express = require("express");
const { findUserByEmail } = require("../data/usersStore");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      message: "Email et mot de passe obligatoires."
    });
  }

  const user = findUserByEmail(email);

  if (!user || user.password !== String(password)) {
    return res.status(401).json({
      message: "Identifiants invalides."
    });
  }

  return res.json({
    token: `fake-token-${user.id}`,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at
    }
  });
});

router.get("/me", requireAuth, (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      created_at: req.user.created_at
    }
  });
});

module.exports = router;