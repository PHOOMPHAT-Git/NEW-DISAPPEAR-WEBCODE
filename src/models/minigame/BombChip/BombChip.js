const mongoose = require('mongoose');

const ChipSchema = new mongoose.Schema({
    index: Number,
    hasBomb: { type: Boolean, default: false },
    revealed: { type: Boolean, default: false },
    revealedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const PlayerGridSchema = new mongoose.Schema({
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    grid: [ChipSchema]
}, { _id: false });

const BombChipGameSchema = new mongoose.Schema({
    roomCode: { type: String, required: true, unique: true, index: true },
    host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    gridSize: { type: Number, enum: [3, 4, 5, 6], default: 4 },
    maxPlayers: { type: Number, enum: [2, 3, 4], default: 2 },
    status: {
        type: String,
        enum: ['waiting', 'placing', 'playing', 'finished'],
        default: 'waiting'
    },
    players: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        bombsPlaced: { type: Boolean, default: false },
        bombsHitOnMyBoard: { type: Number, default: 0 },
        isEliminated: { type: Boolean, default: false },
        joinedAt: { type: Date, default: Date.now }
    }],
    playerGrids: [PlayerGridSchema],
    currentTurnIndex: { type: Number, default: 0 },
    turnOrder: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    losers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    inviteToken: { type: String, unique: true, sparse: true },
    invitedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    created_at: { type: Date, default: Date.now },
    placing_started_at: Date,
    started_at: Date,
    finished_at: Date
});

BombChipGameSchema.index({ status: 1, created_at: -1 });
BombChipGameSchema.index({ 'players.user': 1 });

module.exports = mongoose.models.BombChipGame ||
    mongoose.model('BombChipGame', BombChipGameSchema, 'bombchip_games');
