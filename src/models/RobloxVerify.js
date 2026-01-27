const mongoose = require('mongoose');

const robloxVerifySchema = new mongoose.Schema({
    discord_user_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    roblox_user_id: {
        type: Number,
        required: true
    },
    guild_id: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['verified', 'unverified'],
        default: 'verified'
    },
    verified_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('RobloxVerify', robloxVerifySchema);
