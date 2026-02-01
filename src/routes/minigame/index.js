const express = require('express');
const router = express.Router();
const bombChipRouter = require('./bomb-chip');

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

router.get('/games', requireAuth, (req, res) => {
    res.render('minigame/games', { user: req.session.user });
});

router.use('/bomb-chip', bombChipRouter);

module.exports = router;
