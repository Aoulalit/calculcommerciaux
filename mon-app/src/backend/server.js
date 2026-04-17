const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME";
const DB_FILE = process.env.DB_FILE || "users.db";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

app.use(
    cors({
        origin: CORS_ORIGIN,
        credentials: true,
    })
);

const db = new sqlite3.Database(DB_FILE);

db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
});

function signToken(user) {
    return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: "2h" });
}

function auth(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return res.status(401).json({ message: "Token manquant" });

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ message: "Token invalide" });
    }
}

function admin(req, res, next) {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Accès admin requis" });
    next();
}

// ✅ seed admin au démarrage si absent
async function seedAdmin() {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password) return;

    db.get("SELECT id FROM users WHERE email = ?", [email], async (err, row) => {
        if (err) return console.error("DB error seed:", err);
        if (row) return;

        const hash = await bcrypt.hash(password, 10);
        db.run(
            "INSERT INTO users (email, password_hash, role) VALUES (?,?,?)",
            [email, hash, "admin"],
            (e2) => {
                if (e2) return console.error("Seed insert error:", e2);
                console.log("✅ Admin seed créé:", email, " / ", password);
            }
        );
    });
}

// ---------- AUTH ----------
app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email + mot de passe requis" });

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ message: "Erreur DB" });
        if (!user) return res.status(401).json({ message: "Compte inexistant" });

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ message: "Mot de passe incorrect" });

        const token = signToken(user);
        res.json({
            token,
            user: { id: user.id, email: user.email, role: user.role },
        });
    });
});

// ---------- USERS (ADMIN CRUD) ----------
app.get("/api/users", auth, admin, (req, res) => {
    db.all("SELECT id, email, role, created_at FROM users ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json({ message: "Erreur DB" });
        res.json(rows);
    });
});

app.post("/api/users", auth, admin, async (req, res) => {
    const { email, password, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Email + mot de passe requis" });

    const finalRole = role === "admin" ? "admin" : "user";
    const hash = await bcrypt.hash(password, 10);

    db.run(
        "INSERT INTO users (email, password_hash, role) VALUES (?,?,?)",
        [email, hash, finalRole],
        function (err) {
            if (err && String(err.message || "").includes("UNIQUE")) {
                return res.status(409).json({ message: "Email déjà utilisé" });
            }
            if (err) return res.status(500).json({ message: "Erreur DB" });
            res.status(201).json({ id: this.lastID, email, role: finalRole });
        }
    );
});

app.patch("/api/users/:id", auth, admin, async (req, res) => {
    const id = Number(req.params.id);
    const { role, password } = req.body || {};
    if (!Number.isFinite(id)) return res.status(400).json({ message: "ID invalide" });

    const fields = [];
    const values = [];

    if (role) {
        const finalRole = role === "admin" ? "admin" : "user";
        fields.push("role = ?");
        values.push(finalRole);
    }

    if (password) {
        const hash = await bcrypt.hash(password, 10);
        fields.push("password_hash = ?");
        values.push(hash);
    }

    if (fields.length === 0) return res.status(400).json({ message: "Aucun champ à modifier" });

    values.push(id);

    db.run(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values, function (err) {
        if (err) return res.status(500).json({ message: "Erreur DB" });
        if (this.changes === 0) return res.status(404).json({ message: "Utilisateur introuvable" });
        res.json({ ok: true });
    });
});

app.delete("/api/users/:id", auth, admin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "ID invalide" });

    db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ message: "Erreur DB" });
        if (this.changes === 0) return res.status(404).json({ message: "Utilisateur introuvable" });
        res.status(204).send();
    });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/", (req, res) => {
    res.send("API OK");
});

app.listen(PORT, async () => {
    console.log(`✅ API sur http://localhost:${PORT}`);
    await seedAdmin();
});