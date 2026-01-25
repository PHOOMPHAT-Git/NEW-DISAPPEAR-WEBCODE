const mongoose = require('mongoose');

const GameInvitationSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    game: { type: mongoose.Schema.Types.ObjectId, ref: 'BombChipGame', required: true },
    gameType: { type: String, default: 'bombchip' },
    roomCode: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'expired'], default: 'pending' },
    created_at: { type: Date, default: Date.now },
    expires_at: { type: Date, default: () => new Date(Date.now() + 30 * 60 * 1000) }
});

GameInvitationSchema.index({ to: 1, status: 1 });
GameInvitationSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.GameInvitation ||
    mongoose.model('GameInvitation', GameInvitationSchema, 'game_invitations');
