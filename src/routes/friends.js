const express = require('express');
const router = express.Router();
const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');

// Render friends page
router.get('/', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    try {
        const user = await User.findById(req.session.user.id);
        if (!user) {
            return res.redirect('/login');
        }
        res.render('friends', { user });
    } catch (error) {
        console.error('Error rendering friends page:', error);
        res.status(500).send('An error occurred');
    }
});

// Send friend request by username
router.post('/add', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { username } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Username is required' });
    }

    try {
        const currentUser = await User.findById(req.session.user.id);
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Find target user by username
        const targetUser = await User.findOne({ username: username.trim() });
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Cannot add yourself
        if (currentUser._id.equals(targetUser._id)) {
            return res.status(400).json({ success: false, message: 'Cannot add yourself as a friend' });
        }

        // Check if already friends
        if (currentUser.friends.includes(targetUser._id)) {
            return res.status(400).json({ success: false, message: 'Already friends with this user' });
        }

        // Check if there's a pending request from target user to current user
        const reverseRequest = await FriendRequest.findOne({
            from: targetUser._id,
            to: currentUser._id
        });

        if (reverseRequest) {
            // Accept the friend request automatically (mutual add)
            currentUser.friends.push(targetUser._id);
            targetUser.friends.push(currentUser._id);

            await currentUser.save();
            await targetUser.save();
            await FriendRequest.deleteOne({ _id: reverseRequest._id });

            return res.json({
                success: true,
                message: `You are now friends with ${targetUser.username}`,
                accepted: true
            });
        }

        // Check if request already sent
        const existingRequest = await FriendRequest.findOne({
            from: currentUser._id,
            to: targetUser._id
        });

        if (existingRequest) {
            return res.status(400).json({ success: false, message: 'Friend request already sent' });
        }

        // Create new friend request
        const friendRequest = new FriendRequest({
            from: currentUser._id,
            to: targetUser._id
        });

        await friendRequest.save();

        res.json({
            success: true,
            message: `Friend request sent to ${targetUser.username}`,
            accepted: false
        });
    } catch (error) {
        console.error('Error sending friend request:', error);
        res.status(500).json({ success: false, message: 'Failed to send friend request' });
    }
});

// Get incoming friend requests
router.get('/requests', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    try {
        const requests = await FriendRequest.find({ to: req.session.user.id })
            .populate('from', 'username')
            .sort({ created_at: -1 });

        res.json({ success: true, requests });
    } catch (error) {
        console.error('Error fetching friend requests:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch friend requests' });
    }
});

// Get friends list
router.get('/list', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    try {
        const user = await User.findById(req.session.user.id)
            .populate('friends', 'username email created_at');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, friends: user.friends });
    } catch (error) {
        console.error('Error fetching friends list:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch friends list' });
    }
});

// Remove friend
router.post('/remove', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
    }

    try {
        const currentUser = await User.findById(req.session.user.id);
        const targetUser = await User.findOne({ username });

        if (!currentUser || !targetUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Remove from both users' friend lists
        currentUser.friends = currentUser.friends.filter(
            friendId => !friendId.equals(targetUser._id)
        );
        targetUser.friends = targetUser.friends.filter(
            friendId => !friendId.equals(currentUser._id)
        );

        await currentUser.save();
        await targetUser.save();

        res.json({ success: true, message: `Removed ${targetUser.username} from friends` });
    } catch (error) {
        console.error('Error removing friend:', error);
        res.status(500).json({ success: false, message: 'Failed to remove friend' });
    }
});

// Cancel sent friend request
router.post('/cancel', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
    }

    try {
        const targetUser = await User.findOne({ username });
        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const result = await FriendRequest.deleteOne({
            from: req.session.user.id,
            to: targetUser._id
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Friend request not found' });
        }

        res.json({ success: true, message: 'Friend request cancelled' });
    } catch (error) {
        console.error('Error cancelling friend request:', error);
        res.status(500).json({ success: false, message: 'Failed to cancel friend request' });
    }
});

module.exports = router;
