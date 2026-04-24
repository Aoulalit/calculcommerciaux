const express = require("express");
const {
  getUsers,
  createUser,
  deleteUser,
  findUserByEmail
} = require("../data/usersStore");
const { requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", requireAdmin, (req, res) => {
  const safeUsers = getUsers().map((user) => ({
    id: user.id,
    email: user.email,
    role: user.role,
    created_at: user.created_at
  }));

  return res.json(safeUsers);
});

router.post("/", requireAdmin, (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      message: "Email et mot de passe obligatoires."
    });
  }

  if (findUserByEmail(email)) {
    return res.status(409).json({
      message: "Cet email existe déjà."
    });
  }

  const newUser = createUser({
    email,
    password,
    role
  });

  return res.status(201).json({
    id: newUser.id,
    email: newUser.email,
    role: newUser.role,
    created_at: newUser.created_at
  });
});

router.delete("/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isFinite(id)) {
    return res.status(400).json({
      message: "ID invalide."
    });
  }

  if (req.user.id === id) {
    return res.status(400).json({
      message: "Tu ne peux pas supprimer ton propre compte admin connecté."
    });
  }

  const removed = deleteUser(id);

  if (!removed) {
    return res.status(404).json({
      message: "Utilisateur introuvable."
    });
  }

  return res.json({
    message: "Utilisateur supprimé."
  });
});

module.exports = router;