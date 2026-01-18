const mongoose = require('mongoose');

const FriendRequestSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    created_at: { type: Date, default: Date.now }
});

FriendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

module.exports = mongoose.models.FriendRequest || mongoose.model('FriendRequest', FriendRequestSchema, 'friend_requests');