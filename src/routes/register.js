const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

function generateToken(length = 15) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < length; i++) {
        token += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return token;
}

async function generateUniqueToken() {
    let token;
    let isUnique = false;

    while (!isUnique) {
        token = generateToken(15);
        const existingToken = await User.findOne({ token });
        if (!existingToken) {
            isUnique = true;
        }
    }

    return token;
}

router.get('/', (req, res) => {
    res.render('register', { error: null, user: req.session.user });
});

router.post('/', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    try {
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existingUsername = await User.findOne({ username });
        if (existingUsername) {
            return res.status(400).json({ error: 'Username already registered' });
        }

        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const userToken = await generateUniqueToken();

        const newUser = new User({
            username,
            email,
            password: hashedPassword,
            token: userToken
        });

        await newUser.save();
        console.log(`New user registered: ${username}`);

        req.session.user = {
            id: newUser._id,
            username: newUser.username,
            email: newUser.email
        };

        res.status(201).json({ success: true, redirect: '/' });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

module.exports = router;