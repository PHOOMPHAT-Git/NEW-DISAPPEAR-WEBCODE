const BombChipGame = require('../models/minigame/BombChip/BombChip');
const BombChipStats = require('../models/minigame/BombChip/BombChipStats');
const GameInvitation = require('../models/minigame/BombChip/GameInvitation');

const userRooms = new Map();

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateInviteToken() {
    return require('crypto').randomBytes(16).toString('hex');
}

function getBombCount(gridSize) {
    return gridSize;
}

function createEmptyGrid(gridSize) {
    const totalChips = gridSize * gridSize;
    const grid = [];
    for (let i = 0; i < totalChips; i++) {
        grid.push({
            index: i,
            hasBomb: false,
            revealed: false,
            revealedBy: null
        });
    }
    return grid;
}

function getPlayerGridKey(game, playerId) {
    const playerIndex = game.players.findIndex(p => p.user.toString() === playerId.toString());
    return playerIndex === 0 ? 'player1Grid' : 'player2Grid';
}

function getOpponentGridKey(game, playerId) {
    const playerIndex = game.players.findIndex(p => p.user.toString() === playerId.toString());
    return playerIndex === 0 ? 'player2Grid' : 'player1Grid';
}

function getOpponentPlayer(game, playerId) {
    return game.players.find(p => p.user.toString() !== playerId.toString());
}

async function updateStats(game) {
    for (const player of game.players) {
        let stats = await BombChipStats.findOne({ user: player.user });
        if (!stats) {
            stats = new BombChipStats({ user: player.user });
        }

        stats.totalGames += 1;

        if (game.winner && player.user.toString() === game.winner.toString()) {
            stats.wins += 1;
            stats.currentStreak += 1;
            if (stats.currentStreak > stats.bestStreak) {
                stats.bestStreak = stats.currentStreak;
            }
        } else {
            stats.losses += 1;
            stats.currentStreak = 0;
        }

        stats.updated_at = new Date();
        await stats.save();
    }
}

module.exports = function(io, sessionMiddleware) {
    const gameIo = io.of('/bomb-chip');

    gameIo.use((socket, next) => {
        sessionMiddleware(socket.request, {}, next);
    });

    gameIo.use((socket, next) => {
        const session = socket.request.session;
        if (session && session.user) {
            socket.userId = session.user.id;
            socket.username = session.user.username;
            next();
        } else {
            next(new Error('Unauthorized'));
        }
    });

    gameIo.on('connection', (socket) => {
        console.log(`User ${socket.username} connected to bomb-chip`);

        let __lastErrorAt = 0;
        let __lastErrorMsg = '';
        const __emit = socket.emit.bind(socket);
        socket.emit = (event, ...args) => {
            if (event === 'error' && args[0] && typeof args[0].message === 'string') {
                const now = Date.now();
                const msg = args[0].message;
                if (msg === __lastErrorMsg && now - __lastErrorAt < 1200) return socket;
                __lastErrorMsg = msg;
                __lastErrorAt = now;
            }
            return __emit(event, ...args);
        };

        let __lastSelectAt = 0;
        let __lastPlaceAt = 0;
        const __tooFast = (key, ms) => {
            const now = Date.now();
            if (key === 'select') {
                if (now - __lastSelectAt < ms) return true;
                __lastSelectAt = now;
                return false;
            }
            if (key === 'place') {
                if (now - __lastPlaceAt < ms) return true;
                __lastPlaceAt = now;
                return false;
            }
            return false;
        };

        socket.on('room:create', async (data) => {
            try {
                const { gridSize = 4 } = data;
                const bombCount = getBombCount(gridSize);

                let roomCode;
                let attempts = 0;
                do {
                    roomCode = generateRoomCode();
                    attempts++;
                } while (await BombChipGame.exists({ roomCode, status: { $ne: 'finished' } }) && attempts < 10);

                const game = new BombChipGame({
                    roomCode,
                    host: socket.userId,
                    gridSize,
                    inviteToken: generateInviteToken(),
                    players: [{
                        user: socket.userId,
                        username: socket.username,
                        bombsPlaced: false,
                        bombsHitOnMyBoard: 0
                    }]
                });

                await game.save();

                socket.join(roomCode);
                userRooms.set(socket.userId, roomCode);

                socket.emit('room:joined', {
                    roomCode,
                    inviteToken: game.inviteToken,
                    players: game.players,
                    gameConfig: { gridSize, bombCount },
                    isHost: true
                });
            } catch (error) {
                console.error('Error creating room:', error);
                socket.emit('error', { message: 'Failed to create room' });
            }
        });

        socket.on('room:join', async (data) => {
            try {
                const { roomCode } = data;
                const game = await BombChipGame.findOne({
                    roomCode: roomCode.toUpperCase(),
                    status: 'waiting'
                });

                if (!game) {
                    return socket.emit('error', { message: 'Room not found or game already started' });
                }

                if (game.players.find(p => p.user.toString() === socket.userId)) {
                    return socket.emit('error', { message: 'Already in this room' });
                }

                if (game.players.length >= 2) {
                    return socket.emit('error', { message: 'Room is full (max 2 players)' });
                }

                game.players.push({
                    user: socket.userId,
                    username: socket.username,
                    bombsPlaced: false,
                    bombsHitOnMyBoard: 0
                });

                await game.save();

                socket.join(roomCode);
                userRooms.set(socket.userId, roomCode);

                socket.emit('room:joined', {
                    roomCode,
                    inviteToken: game.inviteToken,
                    players: game.players,
                    gameConfig: { gridSize: game.gridSize, bombCount: getBombCount(game.gridSize) },
                    isHost: game.host.toString() === socket.userId
                });

                socket.to(roomCode).emit('room:player-joined', {
                    player: { user: socket.userId, username: socket.username },
                    playerCount: game.players.length
                });
            } catch (error) {
                console.error('Error joining room:', error);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        socket.on('room:join-invite', async (data) => {
            try {
                const { inviteToken } = data;
                const game = await BombChipGame.findOne({
                    inviteToken,
                    status: 'waiting'
                });

                if (!game) {
                    return socket.emit('error', { message: 'Invite link expired or game already started' });
                }

                if (game.players.find(p => p.user.toString() === socket.userId)) {
                    socket.join(game.roomCode);
                    userRooms.set(socket.userId, game.roomCode);
                    return socket.emit('room:joined', {
                        roomCode: game.roomCode,
                        inviteToken: game.inviteToken,
                        players: game.players,
                        gameConfig: { gridSize: game.gridSize, bombCount: getBombCount(game.gridSize) },
                        isHost: game.host.toString() === socket.userId
                    });
                }

                if (game.players.length >= 2) {
                    return socket.emit('error', { message: 'Room is full (max 2 players)' });
                }

                game.players.push({
                    user: socket.userId,
                    username: socket.username,
                    bombsPlaced: false,
                    bombsHitOnMyBoard: 0
                });

                await game.save();

                socket.join(game.roomCode);
                userRooms.set(socket.userId, game.roomCode);

                socket.emit('room:joined', {
                    roomCode: game.roomCode,
                    inviteToken: game.inviteToken,
                    players: game.players,
                    gameConfig: { gridSize: game.gridSize, bombCount: getBombCount(game.gridSize) },
                    isHost: game.host.toString() === socket.userId
                });

                socket.to(game.roomCode).emit('room:player-joined', {
                    player: { user: socket.userId, username: socket.username },
                    playerCount: game.players.length
                });
            } catch (error) {
                console.error('Error joining via invite:', error);
                socket.emit('error', { message: 'Failed to join room' });
            }
        });

        socket.on('game:start-placing', async () => {
            try {
                const roomCode = userRooms.get(socket.userId);
                if (!roomCode) return socket.emit('error', { message: 'Not in a room' });

                const game = await BombChipGame.findOne({ roomCode, status: 'waiting' });
                if (!game) return socket.emit('error', { message: 'Game not found' });

                if (game.host.toString() !== socket.userId) {
                    return socket.emit('error', { message: 'Only host can start the game' });
                }

                if (game.players.length !== 2) {
                    return socket.emit('error', { message: 'Need exactly 2 players' });
                }

                game.player1Grid = createEmptyGrid(game.gridSize);
                game.player2Grid = createEmptyGrid(game.gridSize);
                game.status = 'placing';
                game.placing_started_at = new Date();

                await game.save();

                const bombCount = getBombCount(game.gridSize);

                gameIo.to(roomCode).emit('game:placing-started', {
                    gridSize: game.gridSize,
                    bombCount: bombCount,
                    players: game.players.map(p => ({
                        user: p.user,
                        username: p.username,
                        bombsPlaced: p.bombsPlaced
                    }))
                });
            } catch (error) {
                console.error('Error starting placement phase:', error);
                socket.emit('error', { message: 'Failed to start placement phase' });
            }
        });

        socket.on('game:place-bomb', async (data) => {
            if (__tooFast('place', 120)) return;
            try {
                const { index } = data;
                const roomCode = userRooms.get(socket.userId);
                if (!roomCode) return;

                const game = await BombChipGame.findOne({ roomCode, status: 'placing' });
                if (!game) return socket.emit('error', { message: 'Game not in placement phase' });

                const player = game.players.find(p => p.user.toString() === socket.userId);
                if (!player) return socket.emit('error', { message: 'Player not found' });

                if (player.bombsPlaced) {
                    return socket.emit('error', { message: 'You have already finished placing bombs' });
                }

                const gridKey = getPlayerGridKey(game, socket.userId);
                const grid = game[gridKey];
                const bombCount = getBombCount(game.gridSize);

                if (index < 0 || index >= grid.length) {
                    return socket.emit('error', { message: 'Invalid position' });
                }

                const chip = grid[index];
                const currentBombs = grid.filter(c => c.hasBomb).length;

                if (chip.hasBomb) {
                    chip.hasBomb = false;
                } else {
                    if (currentBombs >= bombCount) {
                        return socket.emit('error', { message: `You can only place ${bombCount} bombs` });
                    }
                    chip.hasBomb = true;
                }

                await game.save();

                const newBombCount = grid.filter(c => c.hasBomb).length;

                socket.emit('game:bomb-placed', {
                    index,
                    hasBomb: chip.hasBomb,
                    bombsPlaced: newBombCount,
                    bombsRequired: bombCount
                });
            } catch (error) {
                console.error('Error placing bomb:', error);
                socket.emit('error', { message: 'Failed to place bomb' });
            }
        });

        socket.on('game:ready', async () => {
            try {
                const roomCode = userRooms.get(socket.userId);
                if (!roomCode) return;

                const game = await BombChipGame.findOne({ roomCode, status: 'placing' });
                if (!game) return socket.emit('error', { message: 'Game not in placement phase' });

                const player = game.players.find(p => p.user.toString() === socket.userId);
                if (!player) return socket.emit('error', { message: 'Player not found' });

                const gridKey = getPlayerGridKey(game, socket.userId);
                const grid = game[gridKey];
                const bombCount = getBombCount(game.gridSize);
                const placedBombs = grid.filter(c => c.hasBomb).length;

                if (placedBombs !== bombCount) {
                    return socket.emit('error', {
                        message: `You must place exactly ${bombCount} bombs (placed: ${placedBombs})`
                    });
                }

                player.bombsPlaced = true;
                await game.save();

                gameIo.to(roomCode).emit('game:player-ready', {
                    odejde: socket.userId,
                    username: socket.username
                });

                const allReady = game.players.every(p => p.bombsPlaced);

                if (allReady) {
                    game.turnOrder = game.players.map(p => p.user).sort(() => Math.random() - 0.5);
                    game.currentTurnIndex = 0;
                    game.status = 'playing';
                    game.started_at = new Date();

                    await game.save();

                    const currentPlayer = game.players.find(
                        p => p.user.toString() === game.turnOrder[0].toString()
                    );

                    game.players.forEach(p => {
                        const targetSockets = Array.from(gameIo.sockets.values()).filter(
                            s => s.userId === p.user.toString()
                        );

                        const myGridKey = getPlayerGridKey(game, p.user);
                        const opponentGridKey = getOpponentGridKey(game, p.user);

                        const myGrid = game[myGridKey].map(chip => ({
                            index: chip.index,
                            hasBomb: chip.hasBomb,
                            revealed: chip.revealed
                        }));

                        const opponentGrid = game[opponentGridKey].map(chip => ({
                            index: chip.index,
                            revealed: chip.revealed
                        }));

                        targetSockets.forEach(s => {
                            s.emit('game:started', {
                                myGrid,
                                opponentGrid,
                                gridSize: game.gridSize,
                                bombCount: getBombCount(game.gridSize),
                                currentPlayer: {
                                    id: currentPlayer.user,
                                    username: currentPlayer.username
                                },
                                players: game.players.map(pl => ({
                                    user: pl.user,
                                    username: pl.username,
                                    bombsHitOnMyBoard: pl.bombsHitOnMyBoard
                                }))
                            });
                        });
                    });
                }
            } catch (error) {
                console.error('Error setting ready:', error);
                socket.emit('error', { message: 'Failed to set ready' });
            }
        });

        socket.on('game:select-chip', async (data) => {
            if (__tooFast('select', 300)) return;
            try {
                const { index } = data;
                const roomCode = userRooms.get(socket.userId);
                if (!roomCode) return;

                const game = await BombChipGame.findOne({ roomCode, status: 'playing' });
                if (!game) return socket.emit('error', { message: 'Game not found' });

                const currentPlayerId = game.turnOrder[game.currentTurnIndex].toString();
                if (currentPlayerId !== socket.userId) {
                    return socket.emit('error', { message: 'Not your turn' });
                }

                const opponentGridKey = getOpponentGridKey(game, socket.userId);
                const opponentGrid = game[opponentGridKey];
                const opponent = getOpponentPlayer(game, socket.userId);

                const chip = opponentGrid[index];
                if (!chip) {
                    return socket.emit('error', { message: 'Invalid chip selection' });
                }
                if (chip.revealed) {
                    return socket.emit('error', { message: 'Chip already revealed' });
                }

                chip.revealed = true;
                chip.revealedBy = socket.userId;

                const bombCount = getBombCount(game.gridSize);

                const result = {
                    index,
                    hasBomb: chip.hasBomb,
                    revealedBy: { id: socket.userId, username: socket.username },
                    targetBoard: opponent.user.toString()
                };

                if (chip.hasBomb) {
                    opponent.bombsHitOnMyBoard += 1;
                    result.bombsHit = opponent.bombsHitOnMyBoard;
                    result.bombsTotal = bombCount;

                    if (opponent.bombsHitOnMyBoard >= bombCount) {
                        game.status = 'finished';
                        game.loser = socket.userId;
                        game.winner = opponent.user;
                        game.finished_at = new Date();
                        result.gameOver = true;
                        result.winner = { id: opponent.user, username: opponent.username };
                        result.loser = { id: socket.userId, username: socket.username };
                        result.reason = 'Found all bombs';

                        await updateStats(game);
                    }
                }

                if (!result.gameOver) {
                    game.currentTurnIndex = (game.currentTurnIndex + 1) % 2;
                    const nextPlayer = game.players.find(
                        p => p.user.toString() === game.turnOrder[game.currentTurnIndex].toString()
                    );
                    result.nextPlayer = { id: nextPlayer.user, username: nextPlayer.username };
                }

                await game.save();

                gameIo.to(roomCode).emit('game:chip-revealed', result);
            } catch (error) {
                console.error('Error selecting chip:', error);
                socket.emit('error', { message: 'Failed to select chip' });
            }
        });

        socket.on('invite:send', async (data) => {
            try {
                const { friendId } = data;
                const roomCode = userRooms.get(socket.userId);
                if (!roomCode) return socket.emit('error', { message: 'Not in a room' });

                const game = await BombChipGame.findOne({ roomCode, status: 'waiting' });
                if (!game) return socket.emit('error', { message: 'Game not found' });

                const existingInvite = await GameInvitation.findOne({
                    from: socket.userId,
                    to: friendId,
                    game: game._id,
                    status: 'pending'
                });

                if (existingInvite) {
                    return socket.emit('error', { message: 'Invite already sent' });
                }

                const invitation = new GameInvitation({
                    from: socket.userId,
                    to: friendId,
                    game: game._id,
                    roomCode: game.roomCode
                });

                await invitation.save();

                const targetSockets = Array.from(gameIo.sockets.values()).filter(
                    s => s.userId === friendId
                );

                targetSockets.forEach(s => {
                    s.emit('invite:received', {
                        from: { id: socket.userId, username: socket.username },
                        gameType: 'bombchip',
                        roomCode: game.roomCode,
                        inviteToken: game.inviteToken
                    });
                });

                socket.emit('invite:sent', { success: true });
            } catch (error) {
                console.error('Error sending invite:', error);
                socket.emit('error', { message: 'Failed to send invite' });
            }
        });

        socket.on('room:leave', async () => {
            await handleLeaveRoom(socket, gameIo);
        });

        socket.on('disconnect', async () => {
            console.log(`User ${socket.username} disconnected from bomb-chip`);
            await handleLeaveRoom(socket, gameIo);
        });
    });

    async function handleLeaveRoom(socket, gameIo) {
        const roomCode = userRooms.get(socket.userId);
        if (!roomCode) return;

        userRooms.delete(socket.userId);
        socket.leave(roomCode);

        try {
            const game = await BombChipGame.findOne({ roomCode });
            if (!game) return;

            if (game.status === 'waiting') {
                game.players = game.players.filter(p => p.user.toString() !== socket.userId);

                if (game.players.length === 0) {
                    await BombChipGame.deleteOne({ _id: game._id });
                } else if (game.host.toString() === socket.userId) {
                    game.host = game.players[0].user;
                    await game.save();
                    gameIo.to(roomCode).emit('room:host-changed', {
                        newHost: { id: game.players[0].user, username: game.players[0].username }
                    });
                } else {
                    await game.save();
                }

                gameIo.to(roomCode).emit('room:player-left', {
                    odejde: socket.userId,
                    username: socket.username,
                    playerCount: game.players.length
                });
            } else if (game.status === 'placing') {
                const remainingPlayer = game.players.find(p => p.user.toString() !== socket.userId);
                if (remainingPlayer) {
                    game.status = 'finished';
                    game.winner = remainingPlayer.user;
                    game.loser = socket.userId;
                    game.finished_at = new Date();
                    await game.save();
                    await updateStats(game);

                    gameIo.to(roomCode).emit('game:finished', {
                        winner: { id: remainingPlayer.user, username: remainingPlayer.username },
                        loser: { id: socket.userId, username: socket.username },
                        reason: 'Opponent left during placement'
                    });
                }
            } else if (game.status === 'playing') {
                const remainingPlayer = game.players.find(p => p.user.toString() !== socket.userId);
                if (remainingPlayer) {
                    game.status = 'finished';
                    game.winner = remainingPlayer.user;
                    game.loser = socket.userId;
                    game.finished_at = new Date();
                    await game.save();
                    await updateStats(game);

                    gameIo.to(roomCode).emit('game:finished', {
                        winner: { id: remainingPlayer.user, username: remainingPlayer.username },
                        loser: { id: socket.userId, username: socket.username },
                        reason: 'Opponent left the game'
                    });
                }
            }
        } catch (error) {
            console.error('Error handling leave room:', error);
        }
    }
};