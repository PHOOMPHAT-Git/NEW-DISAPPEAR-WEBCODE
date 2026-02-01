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
        res.render('settings', { user });
    } catch (error) {
        console.error('Error fetching user settings:', error);
        res.status(500).send('An error occurred');
    }
});

router.post('/', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { hideEmail } = req.body;

    if (typeof hideEmail !== 'boolean') {
        return res.status(400).json({ message: 'Invalid hideEmail value' });
    }

    try {
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.settings = { hideEmail };
        user.updated_at = Date.now();
        await user.save();

        req.session.user.settings = { hideEmail };

        res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
        console.error('Error saving settings:', error);
        res.status(500).json({ message: 'Failed to save settings' });
    }
});

router.post('/reset', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Reset to default values from User schema
        user.settings = { hideEmail: true };
        user.updated_at = Date.now();
        await user.save();

        req.session.user.settings = { hideEmail: true };

        res.json({ success: true, message: 'Settings reset successfully' });
    } catch (error) {
        console.error('Error resetting settings:', error);
        res.status(500).json({ message: 'Failed to reset settings' });
    }
});

module.exports = router;
