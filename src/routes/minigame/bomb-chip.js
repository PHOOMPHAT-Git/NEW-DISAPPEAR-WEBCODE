const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const BombChipStats = require('../../models/minigame/BombChip/BombChipStats');
const GameInvitation = require('../../models/minigame/BombChip/GameInvitation');

const requireAuth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    next();
};

const requireAuthApi = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

const apiRateState = new Map();

const rateLimitApi = (windowMs) => (req, res, next) => {
    const userId = req.session?.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const key = `${userId}:${req.path}`;
    const now = Date.now();
    const last = apiRateState.get(key) || 0;

    if (now - last < windowMs) {
        return res.status(429).json({ success: false, message: 'Too many requests' });
    }

    apiRateState.set(key, now);
    next();
};

const isValidInviteToken = (token) => typeof token === 'string' && /^[a-f0-9]{32}$/i.test(token);

const loadUserAndStats = async (userId) => {
    const [user, stats] = await Promise.all([
        User.findById(userId).populate('friends', 'username'),
        BombChipStats.findOne({ user: userId })
    ]);

    return {
        user,
        stats: stats || { currentStreak: 0, bestStreak: 0, wins: 0, losses: 0, totalGames: 0 }
    };
};

router.get('/', requireAuth, async (req, res) => {
    try {
        const { user, stats } = await loadUserAndStats(req.session.user.id);
        res.render('minigame/bomb-chip', { user, stats, inviteToken: null });
    } catch (error) {
        console.error('Error loading bomb-chip page:', error);
        res.status(500).send('An error occurred');
    }
});

router.get('/join/:inviteToken', requireAuth, async (req, res) => {
    try {
        const inviteToken = req.params.inviteToken;
        if (!isValidInviteToken(inviteToken)) return res.status(404).send('Not found');

        const { user, stats } = await loadUserAndStats(req.session.user.id);
        res.render('minigame/bomb-chip', { user, stats, inviteToken });
    } catch (error) {
        console.error('Error loading bomb-chip page:', error);
        res.status(500).send('An error occurred');
    }
});

router.get('/api/stats', requireAuthApi, rateLimitApi(600), async (req, res) => {
    try {
        const stats = await BombChipStats.findOne({ user: req.session.user.id });
        res.json({
            success: true,
            stats: stats || { currentStreak: 0, bestStreak: 0, wins: 0, losses: 0, totalGames: 0 }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
});

router.get('/api/invitations', requireAuthApi, rateLimitApi(900), async (req, res) => {
    try {
        const now = new Date();
        await GameInvitation.updateMany(
            { to: req.session.user.id, status: 'pending', expires_at: { $lte: now } },
            { $set: { status: 'expired' } }
        );

        const invitations = await GameInvitation.find({
            to: req.session.user.id,
            status: 'pending',
            expires_at: { $gt: now }
        })
            .populate('from', 'username')
            .populate('game', 'roomCode gridSize');

        res.json({ success: true, invitations });
    } catch (error) {
        console.error('Error fetching invitations:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invitations' });
    }
});

router.get('/api/leaderboard', requireAuthApi, rateLimitApi(1200), async (req, res) => {
    try {
        const leaderboard = await BombChipStats.find()
            .sort({ bestStreak: -1, wins: -1 })
            .limit(10)
            .populate('user', 'username');

        res.json({ success: true, leaderboard });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch leaderboard' });
    }
});

module.exports = router;