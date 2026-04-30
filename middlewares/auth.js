'use strict';

function requireUser(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/connexion');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.adminAuth) {
    return res.redirect('/connexion');
  }
  next();
}

module.exports = { requireUser, requireAdmin };
