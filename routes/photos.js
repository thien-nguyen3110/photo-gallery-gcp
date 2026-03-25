// Routes for dashboard, upload, search, image preview, and download.
const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const pool = require("../db");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename to avoid collisions.
    const safeName = file.originalname.replace(/\s+/g, "_");
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      return cb(null, true);
    }

    return cb(new Error("Only image files are allowed."));
  }
});

router.get("/dashboard", requireAuth, async (req, res) => {
  const searchTerm = (req.query.q || "").trim();

  try {
    const likeTerm = `%${searchTerm}%`;
    const selectSql = `
      SELECT id, title, description, filename, filepath, uploaded_at
      FROM photos
      WHERE user_id = ?
        AND (
          ? = ''
          OR LOWER(title) LIKE LOWER(?)
          OR LOWER(COALESCE(description, '')) LIKE LOWER(?)
        )
      ORDER BY uploaded_at DESC
    `;

    const [photos] = await pool.execute(selectSql, [
      req.session.user.id,
      searchTerm,
      likeTerm,
      likeTerm
    ]);

    return res.render("dashboard", {
      photos,
      searchTerm,
      errorMessage: req.query.error || "",
      successMessage: req.query.success || ""
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return res.status(500).render("dashboard", {
      photos: [],
      searchTerm,
      errorMessage: "Could not load photos right now.",
      successMessage: ""
    });
  }
});

router.get("/upload", requireAuth, (req, res) => {
  return res.render("upload", {
    errorMessage: req.query.error || "",
    successMessage: req.query.success || ""
  });
});

router.post("/upload", requireAuth, (req, res) => {
  upload.single("photo")(req, res, async (uploadError) => {
    if (uploadError) {
      return res.status(400).render("upload", {
        errorMessage: uploadError.message || "Upload failed.",
        successMessage: ""
      });
    }

    const { title, description } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).render("upload", {
        errorMessage: "Title is required.",
        successMessage: ""
      });
    }

    if (!req.file) {
      return res.status(400).render("upload", {
        errorMessage: "Please choose an image file.",
        successMessage: ""
      });
    }

    try {
      const insertSql = `
        INSERT INTO photos (user_id, title, description, filename, filepath)
        VALUES (?, ?, ?, ?, ?)
      `;

      const relativeFilePath = path.join("uploads", req.file.filename).replace(/\\/g, "/");

      await pool.execute(insertSql, [
        req.session.user.id,
        title.trim(),
        description ? description.trim() : null,
        req.file.originalname,
        relativeFilePath
      ]);

      return res.redirect("/photos/dashboard?success=Photo uploaded successfully.");
    } catch (error) {
      console.error("Upload save error:", error);
      return res.status(500).render("upload", {
        errorMessage: "Could not save photo metadata to database.",
        successMessage: ""
      });
    }
  });
});

router.get("/image/:id", requireAuth, async (req, res) => {
  const photoId = Number(req.params.id);

  try {
    const selectSql =
      "SELECT id, user_id, filepath, title FROM photos WHERE id = ? AND user_id = ?";

    const [rows] = await pool.execute(selectSql, [photoId, req.session.user.id]);

    if (rows.length === 0) {
      return res.status(404).render("error", {
        errorMessage: "Photo not found or access denied."
      });
    }

    const photo = rows[0];
    const absolutePath = path.resolve(__dirname, "..", photo.filepath);

    return res.sendFile(absolutePath);
  } catch (error) {
    console.error("Image view error:", error);
    return res.status(500).render("error", {
      errorMessage: "Could not load image."
    });
  }
});

router.get("/download/:id", requireAuth, async (req, res) => {
  const photoId = Number(req.params.id);

  try {
    const selectSql =
      "SELECT id, user_id, filepath, filename FROM photos WHERE id = ? AND user_id = ?";

    const [rows] = await pool.execute(selectSql, [photoId, req.session.user.id]);

    if (rows.length === 0) {
      return res.status(403).render("error", {
        errorMessage: "You are not allowed to download this file."
      });
    }

    const photo = rows[0];
    const absolutePath = path.resolve(__dirname, "..", photo.filepath);

    return res.download(absolutePath, photo.filename);
  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).render("error", {
      errorMessage: "Could not download file."
    });
  }
});

module.exports = router;
