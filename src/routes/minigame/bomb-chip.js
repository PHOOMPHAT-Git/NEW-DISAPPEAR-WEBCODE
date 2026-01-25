const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const BombChipGame = require('../../models/minigame/BombChip/BombChip');
const BombChipStats = require('../../models/minigame/BombChip/BombChipStats');
const GameInvitation = require('../../models/minigame/BombChip/GameInvitation');

const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

const requireAuthApi = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

router.get('/', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).populate('friends', 'username');
        const stats = await BombChipStats.findOne({ user: req.session.user.id });
        res.render('minigame/bomb-chip', { user, stats: stats || {}, inviteToken: null });
    } catch (error) {
        console.error('Error loading bomb-chip page:', error);
        res.status(500).send('An error occurred');
    }
});

router.get('/join/:inviteToken', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.user.id).populate('friends', 'username');
        const stats = await BombChipStats.findOne({ user: req.session.user.id });
        res.render('minigame/bomb-chip', {
            user,
            stats: stats || {},
            inviteToken: req.params.inviteToken
        });
    } catch (error) {
        console.error('Error loading bomb-chip page:', error);
        res.status(500).send('An error occurred');
    }
});

router.get('/api/stats', requireAuthApi, async (req, res) => {
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

router.get('/api/invitations', requireAuthApi, async (req, res) => {
    try {
        const invitations = await GameInvitation.find({
            to: req.session.user.id,
            status: 'pending',
            expires_at: { $gt: new Date() }
        }).populate('from', 'username').populate('game', 'roomCode gridSize');
        res.json({ success: true, invitations });
    } catch (error) {
        console.error('Error fetching invitations:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch invitations' });
    }
});

router.get('/api/leaderboard', requireAuthApi, async (req, res) => {
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
