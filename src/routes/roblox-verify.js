const express = require('express');
const router = express.Router();
const RobloxOAuthState = require('../models/RobloxOAuthState');
const RobloxVerify = require('../models/RobloxVerify');

const ROBLOX_CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const ROBLOX_CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const ROBLOX_REDIRECT_URI = process.env.ROBLOX_REDIRECT_URI || 'https://disappear.world/roblox/callback';
const WEBSITE_URL = process.env.WEBSITE_URL || 'https://disappear.world';
const BOT_API_URL = process.env.BOT_API_URL || '';
const BOT_API_SECRET = process.env.BOT_API_SECRET || '';

// Helper function to assign Discord role via bot API
// Note: This is optional - Bot can also poll /pending-roles endpoint instead
async function assignDiscordRole(discordUserId, guildId) {
    if (!BOT_API_URL || !BOT_API_SECRET) {
        console.log('[Roblox OAuth] BOT_API_URL not configured - bot will use polling instead');
        return false;
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        const response = await fetch(`${BOT_API_URL}/assign-role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                discord_user_id: discordUserId,
                guild_id: guildId,
                secret: BOT_API_SECRET
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        if (data.success) {
            console.log(`[Roblox OAuth] Role assigned to ${discordUserId}`);
            return true;
        } else {
            console.error('[Roblox OAuth] Failed to assign role:', data.error);
            return false;
        }
    } catch (error) {
        // Don't log as error - bot will handle via polling
        console.log(`[Roblox OAuth] Could not reach bot API, role will be assigned via polling`);
        return false;
    }
}

// Helper function to generate PKCE code verifier and challenge
function generateCodeVerifier() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    for (let i = 0; i < 128; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function generateCodeChallenge(verifier) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
}

// Step 1: Redirect to Roblox OAuth
router.get('/verify', async (req, res) => {
    try {
        const { state } = req.query;

        if (!state) {
            return res.status(400).render('roblox-verify', {
                success: false,
                error: 'Invalid verification link. Please use the link from Discord.',
                errorTH: 'ลิงก์ไม่ถูกต้อง กรุณาใช้ลิงก์จาก Discord'
            });
        }

        // Check if state exists and is pending
        const oauthState = await RobloxOAuthState.findOne({ state, status: 'pending' });

        if (!oauthState) {
            return res.status(400).render('roblox-verify', {
                success: false,
                error: 'Verification link has expired or is invalid. Please request a new one from Discord.',
                errorTH: 'ลิงก์หมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่จาก Discord'
            });
        }

        // Generate PKCE code verifier and challenge
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = await generateCodeChallenge(codeVerifier);

        // Store code verifier in session for later use
        req.session.robloxCodeVerifier = codeVerifier;
        req.session.robloxState = state;

        // Build Roblox OAuth URL
        const params = new URLSearchParams({
            client_id: ROBLOX_CLIENT_ID,
            redirect_uri: ROBLOX_REDIRECT_URI,
            response_type: 'code',
            scope: 'openid',
            state: state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256'
        });

        const authUrl = `https://apis.roblox.com/oauth/v1/authorize?${params.toString()}`;
        res.redirect(authUrl);

    } catch (error) {
        console.error('[Roblox OAuth] Error starting verification:', error);
        res.status(500).render('roblox-verify', {
            success: false,
            error: 'An error occurred. Please try again.',
            errorTH: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
        });
    }
});

// Step 2: Handle OAuth callback
router.get('/callback', async (req, res) => {
    try {
        const { code, state, error, error_description } = req.query;

        if (error) {
            console.error('[Roblox OAuth] Error from Roblox:', error, error_description);
            return res.render('roblox-verify', {
                success: false,
                error: error_description || 'Authorization was denied.',
                errorTH: 'การอนุญาตถูกปฏิเสธ'
            });
        }

        if (!code || !state) {
            return res.status(400).render('roblox-verify', {
                success: false,
                error: 'Missing authorization code or state.',
                errorTH: 'ขาดข้อมูลที่จำเป็น'
            });
        }

        // Verify state matches
        const codeVerifier = req.session.robloxCodeVerifier;
        const sessionState = req.session.robloxState;

        if (!codeVerifier || sessionState !== state) {
            return res.status(400).render('roblox-verify', {
                success: false,
                error: 'Invalid session state. Please try again.',
                errorTH: 'Session ไม่ถูกต้อง กรุณาลองใหม่'
            });
        }

        // Check if state exists in database
        const oauthState = await RobloxOAuthState.findOne({ state, status: 'pending' });

        if (!oauthState) {
            return res.status(400).render('roblox-verify', {
                success: false,
                error: 'Verification link has expired. Please request a new one.',
                errorTH: 'ลิงก์หมดอายุแล้ว กรุณาขอลิงก์ใหม่'
            });
        }

        // Exchange code for access token
        const tokenResponse = await fetch('https://apis.roblox.com/oauth/v1/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: ROBLOX_REDIRECT_URI,
                client_id: ROBLOX_CLIENT_ID,
                client_secret: ROBLOX_CLIENT_SECRET,
                code_verifier: codeVerifier
            })
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.json().catch(() => ({}));
            console.error('[Roblox OAuth] Token exchange failed:', errorData);

            await RobloxOAuthState.findOneAndUpdate(
                { state },
                { status: 'error', error_message: 'Token exchange failed' }
            );

            return res.render('roblox-verify', {
                success: false,
                error: 'Failed to authenticate with Roblox. Please try again.',
                errorTH: 'การยืนยันตัวตนกับ Roblox ล้มเหลว กรุณาลองใหม่'
            });
        }

        const tokenData = await tokenResponse.json();

        // Decode ID token to get user ID (sub)
        const idToken = tokenData.id_token;
        let robloxUserId = null;

        if (idToken) {
            // JWT format: header.payload.signature - decode payload
            const payload = idToken.split('.')[1];
            const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
            robloxUserId = parseInt(decoded.sub);
        }

        // Update state with verified status
        await RobloxOAuthState.findOneAndUpdate(
            { state },
            {
                status: 'verified',
                roblox_user_id: robloxUserId,
                verified_at: new Date()
            }
        );

        // Save to RobloxVerify (permanent record)
        await RobloxVerify.findOneAndUpdate(
            { discord_user_id: oauthState.discord_user_id },
            {
                discord_user_id: oauthState.discord_user_id,
                roblox_user_id: robloxUserId,
                guild_id: oauthState.guild_id,
                status: 'verified',
                verified_at: new Date()
            },
            { upsert: true, new: true }
        );

        // Assign Discord role
        await assignDiscordRole(oauthState.discord_user_id, oauthState.guild_id);

        // Clear session data
        delete req.session.robloxCodeVerifier;
        delete req.session.robloxState;

        // Render success page
        res.render('roblox-verify', {
            success: true,
            robloxUserId: robloxUserId
        });

    } catch (error) {
        console.error('[Roblox OAuth] Callback error:', error);
        res.status(500).render('roblox-verify', {
            success: false,
            error: 'An unexpected error occurred. Please try again.',
            errorTH: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่'
        });
    }
});

// API endpoint for Discord bot to get pending role assignments
router.get('/pending-roles', async (req, res) => {
    try {
        const { secret } = req.query;

        if (secret !== BOT_API_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Find all verified users who need role assignment
        const pendingUsers = await RobloxVerify.find({
            status: 'verified',
            role_assigned: { $ne: true }
        }).limit(50);

        res.json({
            success: true,
            users: pendingUsers.map(u => ({
                discord_user_id: u.discord_user_id,
                guild_id: u.guild_id,
                roblox_user_id: u.roblox_user_id
            }))
        });

    } catch (error) {
        console.error('[Roblox OAuth] Pending roles error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint for Discord bot to mark role as assigned
router.post('/role-assigned', async (req, res) => {
    try {
        const { discord_user_id, secret } = req.body;

        if (secret !== BOT_API_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        await RobloxVerify.findOneAndUpdate(
            { discord_user_id },
            { role_assigned: true }
        );

        res.json({ success: true });

    } catch (error) {
        console.error('[Roblox OAuth] Role assigned error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint for Discord bot to check verification status
router.get('/status/:state', async (req, res) => {
    try {
        const { state } = req.params;
        const { secret } = req.query;

        // Verify API secret
        if (secret !== process.env.ROBLOX_API_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const oauthState = await RobloxOAuthState.findOne({ state });

        if (!oauthState) {
            return res.json({ status: 'not_found' });
        }

        res.json({
            status: oauthState.status,
            discord_user_id: oauthState.discord_user_id,
            guild_id: oauthState.guild_id,
            roblox_user_id: oauthState.roblox_user_id,
            roblox_username: oauthState.roblox_username,
            verified_at: oauthState.verified_at
        });

    } catch (error) {
        console.error('[Roblox OAuth] Status check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint for Discord bot to create OAuth state
router.post('/create-state', async (req, res) => {
    try {
        const { state, discord_user_id, guild_id, secret } = req.body;

        // Verify API secret
        if (secret !== process.env.ROBLOX_API_SECRET) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!state || !discord_user_id || !guild_id) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Delete any existing pending states for this user
        await RobloxOAuthState.deleteMany({
            discord_user_id,
            status: 'pending'
        });

        // Create new state
        const newState = new RobloxOAuthState({
            state,
            discord_user_id,
            guild_id
        });

        await newState.save();

        res.json({
            success: true,
            verify_url: `${WEBSITE_URL}/roblox/verify?state=${state}`
        });

    } catch (error) {
        console.error('[Roblox OAuth] Create state error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Direct verification link from Discord bot
router.get('/start/:discordUserId/:guildId', async (req, res) => {
    try {
        const { discordUserId, guildId } = req.params;

        if (!discordUserId || !guildId) {
            return res.status(400).render('roblox-verify', {
                success: false,
                error: 'Invalid verification link.',
                errorTH: 'ลิงก์ไม่ถูกต้อง'
            });
        }

        // Check if user is already verified
        const existingVerify = await RobloxVerify.findOne({
            discord_user_id: discordUserId,
            status: 'verified'
        });

        if (existingVerify) {
            // Assign role even if already verified (in case they lost it)
            await assignDiscordRole(discordUserId, guildId);

            return res.render('roblox-verify', {
                success: true,
                alreadyVerified: true,
                robloxUserId: existingVerify.roblox_user_id
            });
        }

        // Generate state
        const crypto = require('crypto');
        const state = crypto.randomBytes(32).toString('hex');

        // Delete any existing pending states for this user
        await RobloxOAuthState.deleteMany({
            discord_user_id: discordUserId,
            status: 'pending'
        });

        // Create new state
        const newState = new RobloxOAuthState({
            state,
            discord_user_id: discordUserId,
            guild_id: guildId
        });

        await newState.save();

        // Redirect to verify endpoint
        res.redirect(`/roblox/verify?state=${state}`);

    } catch (error) {
        console.error('[Roblox OAuth] Start verification error:', error);
        res.status(500).render('roblox-verify', {
            success: false,
            error: 'An error occurred. Please try again.',
            errorTH: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
        });
    }
});

module.exports = router;
