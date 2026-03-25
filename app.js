// Main Express server file.
const path = require("path");
const express = require("express");
const session = require("express-session");
const dotenv = require("dotenv");

const authRoutes = require("./routes/auth");
const photoRoutes = require("./routes/photos");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 // 1 hour
    }
  })
);

// Make the logged-in user available in all EJS templates.
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

app.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect("/photos/dashboard");
  }

  return res.redirect("/auth/login");
});

app.use("/auth", authRoutes);
app.use("/photos", photoRoutes);

app.use((req, res) => {
  return res.status(404).render("error", {
    errorMessage: "Page not found."
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  return res.status(500).render("error", {
    errorMessage: "Something went wrong. Please try again."
  });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
