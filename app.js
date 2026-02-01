require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const connectDB = require('./src/config/db');

const indexRouter = require('./src/routes/index');
const aboutRouter = require('./src/routes/about');
const termsRouter = require('./src/routes/terms');
const privacyRouter = require('./src/routes/privacy');
const registerRouter = require('./src/routes/register');
const loginRouter = require('./src/routes/login');
const logoutRouter = require('./src/routes/logout');
const accountRouter = require('./src/routes/account');
const settingsRouter = require('./src/routes/settings');
const friendsRouter = require('./src/routes/friends');
const minigameRouter = require('./src/routes/minigame');
const robloxVerifyRouter = require('./src/routes/roblox-verify');
const statusRouter = require('./src/routes/status');

const bombChipSocket = require('./src/sockets/bomb-chip');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

connectDB();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views/pages'));

app.get('/config.js', (req, res) => {
    res.type('application/javascript').send(
        'window.APP_CONFIG=' +
            JSON.stringify({
                DISCORD: process.env.DISCORD || '',
                YOUTUBE: process.env.YOUTUBE || '',
                TIKTOK: process.env.TIKTOK || '',
                INSTAGRAM: process.env.INSTAGRAM || '',
                FACEBOOK: process.env.FACEBOOK || ''
            }) +
            ';'
    );
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.WEBSITE_MONGO_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: false
    }
});

app.use(sessionMiddleware);

bombChipSocket(io, sessionMiddleware);

app.use('/', indexRouter);
app.use('/about', aboutRouter);
app.use('/terms', termsRouter);
app.use('/privacy', privacyRouter);
app.use('/register', registerRouter);
app.use('/login', loginRouter);
app.use('/logout', logoutRouter);
app.use('/account', accountRouter);
app.use('/settings', settingsRouter);
app.use('/friends', friendsRouter);
app.use('/minigame', minigameRouter);
app.use('/roblox', robloxVerifyRouter);
app.use('/api/status', statusRouter);

app.use((req, res) => {
    res.status(404).render('error', {
        statusCode: 404,
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist or has been moved.'
    });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).render('error', {
        statusCode: err.status || 500,
        title: 'Something Went Wrong',
        message: 'An unexpected error occurred. Please try again later.'
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = app;
