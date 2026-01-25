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

function generateGrid(gridSize, bombCount) {
    const totalChips = gridSize * gridSize;
    const grid = [];
    const bombPositions = new Set();

    while (bombPositions.size < bombCount) {
        bombPositions.add(Math.floor(Math.random() * totalChips));
    }

    for (let i = 0; i < totalChips; i++) {
        grid.push({
            index: i,
            hasBomb: bombPositions.has(i),
            revealed: false,
            revealedBy: null
        });
    }

    return grid;
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

        socket.on('room:create', async (data) => {
            try {
                const { gridSize = 4, bombCount } = data;
                const totalChips = gridSize * gridSize;
                const maxBombs = Math.floor(totalChips * 0.5);
                const actualBombCount = Math.min(bombCount || Math.floor(totalChips * 0.25), maxBombs);

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
                    bombCount: actualBombCount,
                    inviteToken: generateInviteToken(),
                    players: [{
                        user: socket.userId,
                        username: socket.username,
                        isAlive: true
                    }]
                });

                await game.save();

                socket.join(roomCode);
                userRooms.set(socket.userId, roomCode);

                socket.emit('room:joined', {
                    roomCode,
                    inviteToken: game.inviteToken,
                    players: game.players,
                    gameConfig: { gridSize, bombCount: actualBombCount },
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
                    isAlive: true
                });

                await game.save();

                socket.join(roomCode);
                userRooms.set(socket.userId, roomCode);

                socket.emit('room:joined', {
                    roomCode,
                    inviteToken: game.inviteToken,
                    players: game.players,
                    gameConfig: { gridSize: game.gridSize, bombCount: game.bombCount },
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
                        gameConfig: { gridSize: game.gridSize, bombCount: game.bombCount },
                        isHost: game.host.toString() === socket.userId
                    });
                }

                if (game.players.length >= 2) {
                    return socket.emit('error', { message: 'Room is full (max 2 players)' });
                }

                game.players.push({
                    user: socket.userId,
                    username: socket.username,
                    isAlive: true
                });

                await game.save();

                socket.join(game.roomCode);
                userRooms.set(socket.userId, game.roomCode);

                socket.emit('room:joined', {
                    roomCode: game.roomCode,
                    inviteToken: game.inviteToken,
                    players: game.players,
                    gameConfig: { gridSize: game.gridSize, bombCount: game.bombCount },
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

        socket.on('game:start', async () => {
            try {
                const roomCode = userRooms.get(socket.userId);
                if (!roomCode) return socket.emit('error', { message: 'Not in a room' });

                const game = await BombChipGame.findOne({ roomCode, status: 'waiting' });
                if (!game) return socket.emit('error', { message: 'Game not found' });

                if (game.host.toString() !== socket.userId) {
                    return socket.emit('error', { message: 'Only host can start the game' });
                }

                if (game.players.length < 2) {
                    return socket.emit('error', { message: 'Need at least 2 players' });
                }

                game.grid = generateGrid(game.gridSize, game.bombCount);
                game.turnOrder = game.players.map(p => p.user).sort(() => Math.random() - 0.5);
                game.currentTurnIndex = 0;
                game.status = 'playing';
                game.started_at = new Date();

                await game.save();

                const clientGrid = game.grid.map(chip => ({
                    index: chip.index,
                    revealed: chip.revealed
                }));

                const currentPlayer = game.players.find(
                    p => p.user.toString() === game.turnOrder[0].toString()
                );

                gameIo.to(roomCode).emit('game:started', {
                    grid: clientGrid,
                    turnOrder: game.turnOrder,
                    currentPlayer: { id: currentPlayer.user, username: currentPlayer.username },
                    players: game.players
                });
            } catch (error) {
                console.error('Error starting game:', error);
                socket.emit('error', { message: 'Failed to start game' });
            }
        });

        socket.on('game:select-chip', async (data) => {
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

                const player = game.players.find(p => p.user.toString() === socket.userId);
                if (!player || !player.isAlive) {
                    return socket.emit('error', { message: 'You are eliminated' });
                }

                const chip = game.grid[index];
                if (!chip || chip.revealed) {
                    return socket.emit('error', { message: 'Invalid chip selection' });
                }

                chip.revealed = true;
                chip.revealedBy = socket.userId;

                const result = {
                    index,
                    hasBomb: chip.hasBomb,
                    revealedBy: { id: socket.userId, username: socket.username }
                };

                if (chip.hasBomb) {
                    player.isAlive = false;
                    result.eliminated = { id: socket.userId, username: socket.username };
                }

                const alivePlayers = game.players.filter(p => p.isAlive);

                if (alivePlayers.length === 1) {
                    game.status = 'finished';
                    game.winner = alivePlayers[0].user;
                    game.finished_at = new Date();
                    result.gameOver = true;
                    result.winner = { id: alivePlayers[0].user, username: alivePlayers[0].username };

                    await updateStats(game);
                } else if (alivePlayers.length === 0) {
                    game.status = 'finished';
                    game.finished_at = new Date();
                    result.gameOver = true;
                    result.winner = null;
                } else {
                    let nextIndex = game.currentTurnIndex;
                    do {
                        nextIndex = (nextIndex + 1) % game.turnOrder.length;
                    } while (!game.players.find(p =>
                        p.user.toString() === game.turnOrder[nextIndex].toString() && p.isAlive
                    ));

                    game.currentTurnIndex = nextIndex;
                    const nextPlayer = game.players.find(
                        p => p.user.toString() === game.turnOrder[nextIndex].toString()
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
            } else if (game.status === 'playing') {
                const player = game.players.find(p => p.user.toString() === socket.userId);
                if (player) {
                    player.isAlive = false;

                    const alivePlayers = game.players.filter(p => p.isAlive);
                    if (alivePlayers.length === 1) {
                        game.status = 'finished';
                        game.winner = alivePlayers[0].user;
                        game.finished_at = new Date();
                        await game.save();
                        await updateStats(game);

                        gameIo.to(roomCode).emit('game:finished', {
                            winner: { id: alivePlayers[0].user, username: alivePlayers[0].username },
                            reason: 'All other players left'
                        });
                    } else if (alivePlayers.length === 0) {
                        game.status = 'finished';
                        game.finished_at = new Date();
                        await game.save();

                        gameIo.to(roomCode).emit('game:finished', {
                            winner: null,
                            reason: 'All players left'
                        });
                    } else {
                        if (game.turnOrder[game.currentTurnIndex].toString() === socket.userId) {
                            let nextIndex = game.currentTurnIndex;
                            do {
                                nextIndex = (nextIndex + 1) % game.turnOrder.length;
                            } while (!game.players.find(p =>
                                p.user.toString() === game.turnOrder[nextIndex].toString() && p.isAlive
                            ));
                            game.currentTurnIndex = nextIndex;
                        }

                        await game.save();

                        const nextPlayer = game.players.find(
                            p => p.user.toString() === game.turnOrder[game.currentTurnIndex].toString()
                        );

                        gameIo.to(roomCode).emit('game:player-left', {
                            userId: socket.userId,
                            username: socket.username,
                            nextPlayer: nextPlayer ? { id: nextPlayer.user, username: nextPlayer.username } : null
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error handling leave room:', error);
        }
    }
};
