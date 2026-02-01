const mongoose = require('mongoose');

const BombChipStatsSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    totalGames: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    chipsRevealed: { type: Number, default: 0 },
    bombsHit: { type: Number, default: 0 },
    updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.models.BombChipStats ||
    mongoose.model('BombChipStats', BombChipStatsSchema, 'bombchip_stats');
