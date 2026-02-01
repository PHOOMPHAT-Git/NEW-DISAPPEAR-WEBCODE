const mongoose = require('mongoose');

const ServiceStatusSchema = new mongoose.Schema({
    serviceName: {
        type: String,
        required: true,
        unique: true,
        enum: ['discord-bot', 'website']
    },
    status: {
        type: String,
        required: true,
        enum: ['online', 'offline', 'maintenance', 'degraded'],
        default: 'offline'
    },
    lastHeartbeat: {
        type: Date,
        default: Date.now
    },
    details: {
        version: { type: String, default: '' },
        uptime: { type: Number, default: 0 },
        message: { type: String, default: '' }
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

ServiceStatusSchema.pre('save', function(next) {
    this.updated_at = Date.now();
    next();
});

module.exports = mongoose.models.ServiceStatus || mongoose.model('ServiceStatus', ServiceStatusSchema, 'service_status');
