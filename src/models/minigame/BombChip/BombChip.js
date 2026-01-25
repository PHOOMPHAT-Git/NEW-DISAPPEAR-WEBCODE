const mongoose = require('mongoose');

const BombChipGameSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, unique: true, index: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gridSize: { type: Number, enum: [4, 5, 6], default: 4 },
    bombCount: { type: Number, required: true },
    status: {
        type: String,
        enum: ['waiting', 'playing', 'finished'],
        default: 'waiting'
    },
    players: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        isAlive: { type: Boolean, default: true },
        joinedAt: { type: Date, default: Date.now }
    }],
    grid: [{
        index: Number,
        hasBomb: Boolean,
        revealed: { type: Boolean, default: false },
        revealedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }],
    currentTurnIndex: { type: Number, default: 0 },
    turnOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    inviteToken: { type: String, unique: true, sparse: true },
    invitedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    created_at: { type: Date, default: Date.now },
    started_at: Date,
    finished_at: Date
});

BombChipGameSchema.index({ status: 1, created_at: -1 });
BombChipGameSchema.index({ 'players.user': 1 });

module.exports = mongoose.models.BombChipGame ||
    mongoose.model('BombChipGame', BombChipGameSchema, 'bombchip_games');
