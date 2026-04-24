const express = require("express");
const cors = require("cors");
require("dotenv").config();

const bikeRoutes = require("./routes/bikeRoutes");
const authRoutes = require("./routes/authRoutes");
const usersRoutes = require("./routes/usersRoutes");

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://192.168.100.24:3000",
      "http://192.168.100.24:8080"
    ],
    credentials: true
  })
);

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/routes", bikeRoutes);
app.use("/api/users", usersRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});