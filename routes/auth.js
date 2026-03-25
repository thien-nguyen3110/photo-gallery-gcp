// Routes for register, login, and logout.
const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");

const router = express.Router();

function getAuthDbErrorMessage(error) {
  if (!error || !error.code) {
    return null;
  }

  if (error.code === "ETIMEDOUT") {
    return "Database connection timed out. Check Cloud SQL IP allowlist/network and DB host settings.";
  }

  if (error.code === "ECONNREFUSED") {
    return "Database connection was refused. Verify DB host/port and that MySQL is running and reachable.";
  }

  if (error.code === "ER_ACCESS_DENIED_ERROR") {
    return "Database credentials are invalid. Check DB_USER and DB_PASSWORD in .env.";
  }

  if (error.code === "ER_BAD_DB_ERROR") {
    return "Database name not found. Check DB_NAME in .env.";
  }

  return null;
}

router.get("/register", (req, res) => {
  return res.render("register", {
    errorMessage: req.query.error || "",
    successMessage: req.query.success || ""
  });
});

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).render("register", {
      errorMessage: "All fields are required.",
      successMessage: ""
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const insertSql =
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)";

    await pool.execute(insertSql, [username.trim(), email.trim(), passwordHash]);

    return res.redirect("/auth/login?success=Registration successful. Please log in.");
  } catch (error) {
    console.error("Register error:", error);

    const dbErrorMessage = getAuthDbErrorMessage(error);
    if (dbErrorMessage) {
      return res.status(503).render("register", {
        errorMessage: dbErrorMessage,
        successMessage: ""
      });
    }

    if (error && error.code === "ER_DUP_ENTRY") {
      return res.status(400).render("register", {
        errorMessage: "Username or email already exists.",
        successMessage: ""
      });
    }

    return res.status(500).render("register", {
      errorMessage: "Unable to register right now. Please try again.",
      successMessage: ""
    });
  }
});

router.get("/login", (req, res) => {
  return res.render("login", {
    errorMessage: req.query.error || "",
    successMessage: req.query.success || ""
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).render("login", {
      errorMessage: "Email and password are required.",
      successMessage: ""
    });
  }

  try {
    const selectSql = "SELECT id, username, email, password_hash FROM users WHERE email = ?";
    const [rows] = await pool.execute(selectSql, [email.trim()]);

    if (rows.length === 0) {
      return res.status(401).render("login", {
        errorMessage: "No account found with that email.",
        successMessage: ""
      });
    }

    const user = rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).render("login", {
        errorMessage: "Incorrect password.",
        successMessage: ""
      });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email
    };

    return res.redirect("/photos/dashboard");
  } catch (error) {
    console.error("Login error:", error);

    const dbErrorMessage = getAuthDbErrorMessage(error);
    if (dbErrorMessage) {
      return res.status(503).render("login", {
        errorMessage: dbErrorMessage,
        successMessage: ""
      });
    }

    return res.status(500).render("login", {
      errorMessage: "Unable to log in right now. Please try again.",
      successMessage: ""
    });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout error:", error);
      return res.redirect("/photos/dashboard?error=Could not log out. Try again.");
    }

    return res.redirect("/auth/login?success=You have logged out.");
  });
});

module.exports = router;
