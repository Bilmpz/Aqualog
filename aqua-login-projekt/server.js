// Main .js til hjemmeside

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
app.use(cookieParser());

if (process.env.NODE_ENV !== "production") {
  try {
    const livereload = require("livereload");
    const connectLivereload = require("connect-livereload");
    const lrServer = livereload.createServer({
      exts: ["html", "css", "js"],
      delay: 200,
    });
    const rootDir = require("path").resolve(__dirname, "..");
    lrServer.watch([rootDir + "/login", rootDir + "/forside"]);
    app.use(connectLivereload());
    console.log("[dev] LiveReload aktiv");
  } catch (e) {
    console.warn("[dev] LiveReload ikke aktiv:", e.message);
  }
}

// Premade profiler på hjemmesiden 
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@demo.dk";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo";


let db = { connected: false };

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn("[auth] DATABASE_URL mangler – kører i DEMO-mode (ingen database)");
    return;
  }
  try {
    const sslOption = process.env.DB_SSL_DISABLE ? false : { rejectUnauthorized: false };
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslOption });
    db.pool = pool;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Hvis brugeren ikke findes
    const { rows } = await pool.query("SELECT id FROM users WHERE email=$1", [DEMO_EMAIL]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
      await pool.query("INSERT INTO users(email, password_hash) VALUES ($1,$2)", [DEMO_EMAIL, hash]);
      console.log(`[auth] Oprettede demo-bruger: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    }
    db.connected = true;
    console.log("[db] Forbundet til PostgreSQL");
  } catch (err) {
    console.warn("[db] Kunne ikke forbinde til PostgreSQL:", err.message);
    console.warn("[auth] Fortsætter i DEMO-mode (uden database)");
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ ok: false, error: "Ingen token" });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "Ugyldig token" });
  }
}

// send brugeren til login-siden
app.get("/", (req, res) => {
  res.redirect("/login/index.html");
});


const rootDir = path.resolve(__dirname, "..");
app.use("/login", express.static(path.join(rootDir, "login")));

// Kræv login for at tilgå /forside (statisk indhold bag auth)
function requireAuthStatic(req, res, next) {
  // Kun beskyt GET/HEAD for statiske filer; andre metoder håndteres af API'et
  if (!/^(GET|HEAD)$/i.test(req.method)) return next();
  const token = req.cookies.token;
  if (!token) return res.redirect("/login/index.html");
  try {
    jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.redirect("/login/index.html");
  }
}

app.use("/forside", requireAuthStatic, express.static(path.join(rootDir, "forside")));

app.get("/login", (req, res) => res.sendFile(path.join(rootDir, "login", "index.html")));
app.get("/forside", (req, res) => res.sendFile(path.join(rootDir, "forside", "forside.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(rootDir, "forside", "forside.html")));


app.get("/api/ping", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});


app.get("/api/db-health", async (req, res) => {
  try {
    if (!db.connected || !db.pool) {
      return res.status(200).json({ ok: false, connected: false });
    }
    const r = await db.pool.query("SELECT NOW() as now");
    res.json({ ok: true, connected: true, now: r.rows[0].now });
  } catch (e) {
    res.status(200).json({ ok: false, connected: false, error: e.message });
  }
});


app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "Mangler email eller adgangskode" });
  }
  try {
    let user = null;
    if (db.connected) {
      const { rows } = await db.pool.query("SELECT id, email, password_hash FROM users WHERE email=$1", [email]);
      if (rows.length) user = rows[0];
    } else if (email.toLowerCase() === DEMO_EMAIL.toLowerCase() && password === DEMO_PASSWORD) {
 
      user = { id: 0, email: DEMO_EMAIL };
    }

    if (!user) return res.status(401).json({ ok: false, error: "Forkert login" });
    if (user.password_hash) {
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ ok: false, error: "Forkert login" });
    }

    const token = signToken({ uid: user.id, email: user.email || email });
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("/api/login fejl:", e);
    res.status(500).json({ ok: false, error: "Serverfejl" });
  }
});


app.post("/api/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

// Hent profil (kræver login)
app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ ok: true, user: req.user });
});

const PORT = process.env.PORT || 3000;
initDb().finally(() => {
  app.listen(PORT, () => {
    console.log("Server kører på port", PORT);
  });
});
