const express = require('express');
const router = express.Router();
const ServiceStatus = require('../models/ServiceStatus');

const HEARTBEAT_TIMEOUT = 30000; // 30 seconds

// Get all services status
router.get('/', async (req, res) => {
    try {
        const services = await ServiceStatus.find({});
        const now = Date.now();

        const statusMap = {
            'discord-bot': { status: 'offline', lastHeartbeat: null, details: {} },
            'website': { status: 'online', lastHeartbeat: now, details: {} }
        };

        services.forEach(service => {
            const isOnline = (now - new Date(service.lastHeartbeat).getTime()) < HEARTBEAT_TIMEOUT;
            statusMap[service.serviceName] = {
                status: isOnline ? service.status : 'offline',
                lastHeartbeat: service.lastHeartbeat,
                details: service.details || {}
            };
        });

        // Website is always online if this endpoint responds
        statusMap['website'].status = 'online';
        statusMap['website'].lastHeartbeat = new Date();

        res.json({
            success: true,
            services: statusMap,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error fetching status:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch status' });
    }
});

// Get specific service status
router.get('/:serviceName', async (req, res) => {
    try {
        const { serviceName } = req.params;

        if (serviceName === 'website') {
            return res.json({
                success: true,
                service: {
                    serviceName: 'website',
                    status: 'online',
                    lastHeartbeat: new Date(),
                    details: {}
                }
            });
        }

        const service = await ServiceStatus.findOne({ serviceName });

        if (!service) {
            return res.json({
                success: true,
                service: {
                    serviceName,
                    status: 'offline',
                    lastHeartbeat: null,
                    details: {}
                }
            });
        }

        const now = Date.now();
        const isOnline = (now - new Date(service.lastHeartbeat).getTime()) < HEARTBEAT_TIMEOUT;

        res.json({
            success: true,
            service: {
                serviceName: service.serviceName,
                status: isOnline ? service.status : 'offline',
                lastHeartbeat: service.lastHeartbeat,
                details: service.details || {}
            }
        });
    } catch (error) {
        console.error('Error fetching service status:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch service status' });
    }
});

// Bot heartbeat endpoint - Bot calls this periodically to report status
router.post('/heartbeat', async (req, res) => {
    try {
        const { serviceName, status, details, apiKey } = req.body;

        // Validate API key (should be set in .env)
        if (apiKey !== process.env.STATUS_API_KEY) {
            return res.status(401).json({ success: false, error: 'Invalid API key' });
        }

        if (!serviceName || !['discord-bot', 'website'].includes(serviceName)) {
            return res.status(400).json({ success: false, error: 'Invalid service name' });
        }

        if (!status || !['online', 'offline', 'maintenance', 'degraded'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        const service = await ServiceStatus.findOneAndUpdate(
            { serviceName },
            {
                $set: {
                    status,
                    lastHeartbeat: new Date(),
                    details: details || {},
                    updated_at: new Date()
                },
                $setOnInsert: {
                    created_at: new Date()
                }
            },
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            service: {
                serviceName: service.serviceName,
                status: service.status,
                lastHeartbeat: service.lastHeartbeat
            }
        });
    } catch (error) {
        console.error('Error updating heartbeat:', error);
        res.status(500).json({ success: false, error: 'Failed to update heartbeat' });
    }
});

module.exports = router;
