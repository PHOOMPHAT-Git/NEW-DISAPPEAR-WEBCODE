const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.redirect('/login');
        }
        res.render('account', { user });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).send('An error occurred');
    }
});

module.exports = router;
