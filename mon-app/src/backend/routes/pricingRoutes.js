const express = require("express");
const { getConfig, updateConfig, FIELD_KEYS } = require("../data/pricingStore");
const { requireAuth, requireAdmin } = require("../middleware/authMiddleware");

const router = express.Router();

// Lecture accessible à tout utilisateur connecté (nécessaire pour la page Calculateur)
router.get("/", requireAuth, (req, res) => {
  return res.json(getConfig());
});

// Écriture réservée aux admins
router.put("/", requireAdmin, (req, res) => {
  const body = req.body || {};

  const invalidKeys = Object.keys(body).filter(
    (key) => !FIELD_KEYS.includes(key)
  );

  if (invalidKeys.length) {
    return res.status(400).json({
      message: `Champ(s) inconnu(s) : ${invalidKeys.join(", ")}`
    });
  }

  const updated = updateConfig(body);

  return res.json(updated);
});

module.exports = router;