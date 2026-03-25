// Middleware used to protect routes that require login.
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/auth/login?error=Please log in first");
  }

  return next();
}

module.exports = {
  requireAuth
};
