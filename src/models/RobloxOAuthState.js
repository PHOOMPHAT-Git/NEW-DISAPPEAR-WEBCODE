const mongoose = require('mongoose');

const robloxOAuthStateSchema = new mongoose.Schema({
    state: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    discord_user_id: {
        type: String,
        required: true,
        index: true
    },
    guild_id: {
        type: String,
        required: true
    },
    roblox_user_id: {
        type: Number,
        default: null
    },
    roblox_username: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'verified', 'expired', 'error'],
        default: 'pending',
        index: true
    },
    created_at: {
        type: Date,
        default: Date.now,
        index: true,
        expires: 900 // Auto-delete after 15 minutes
    },
    verified_at: {
        type: Date,
        default: null
    },
    error_message: {
        type: String,
        default: null
    }
});

module.exports = mongoose.model('RobloxOAuthState', robloxOAuthStateSchema);
