const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('terms', { user: req.session.user });
});

module.exports = router;