const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/', async (req, res) => {
    if (!req.session.user) {
        return res.render('index', { user: null });
    }
    try {
        const dbUser = await User.findById(req.session.user.id).select('created_at').lean();
        const user = { ...req.session.user, created_at: dbUser ? dbUser.created_at : null };
        res.render('index', { user });
    } catch (_) {
        res.render('index', { user: req.session.user });
    }
});

module.exports = router;
