const BombChipGame = require('../models/minigame/BombChip/BombChip');
const BombChipStats = require('../models/minigame/BombChip/BombChipStats');
const GameInvitation = require('../models/minigame/BombChip/GameInvitation');
const User = require('../models/User');

const SECRET_HINT_EMAIL = 'phomphat385@gmail.com';

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

function getPlayerGrid(game, playerId) {
    const playerGrid = game.playerGrids.find(pg => pg.playerId.toString() === playerId.toString());
    return playerGrid ? playerGrid.grid : null;
}

function getAlivePlayers(game) {
    return game.players.filter(p => !p.isEliminated);
}

function getNextAlivePlayerIndex(game, currentIndex) {
    const totalPlayers = game.turnOrder.length;
    let nextIndex = (currentIndex + 1) % totalPlayers;
    let checked = 0;

    while (checked < totalPlayers) {
        const playerId = game.turnOrder[nextIndex];
        const player = game.players.find(p => p.user.toString() === playerId.toString());
        if (player && !player.isEliminated) {
            return nextIndex;
        }
        nextIndex = (nextIndex + 1) % totalPlayers;
        checked++;
    }
    return -1;
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

const ROOM_EXPIRE_MINUTES = 30;

async function cleanupStaleRooms() {
    try {
        const cutoffTime = new Date(Date.now() - ROOM_EXPIRE_MINUTES * 60 * 1000);

        const staleRooms = await BombChipGame.deleteMany({
            status: { $in: ['waiting', 'starting'] },
            created_at: { $lt: cutoffTime }
        });

        if (staleRooms.deletedCount > 0) {
            console.log(`[Bomb-Chip Cleanup] Deleted ${staleRooms.deletedCount} stale waiting rooms`);
        }

        const staleInvitations = await GameInvitation.deleteMany({
            status: 'pending',
            created_at: { $lt: cutoffTime }
        });

        if (staleInvitations.deletedCount > 0) {
            console.log(`[Bomb-Chip Cleanup] Deleted ${staleInvitations.deletedCount} stale invitations`);
        }
    } catch (error) {
        console.error('[Bomb-Chip Cleanup] Error:', error);
    }
}

module.exports = function(io, sessionMiddleware) {
    const gameIo = io.of('/bomb-chip');

    setInterval(cleanupStaleRooms, 5 * 60 * 1000);
    cleanupStaleRooms();

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

    gameIo.on('connection', async (socket) => {
        console.log(`User ${socket.username} connected to bomb-chip`);

        // Send pending invitations to the user on connection
        try {
            const pendingInvites = await GameInvitation.find({
                to: socket.userId,
                status: 'pending'
            }).populate('from', 'username');

            for (const invite of pendingInvites) {
                // Check if the game still exists and is waiting
                const game = await BombChipGame.findOne({
                    _id: invite.game,
                    status: 'waiting'
                });

                if (game) {
                    socket.emit('invite:received', {
                        from: { id: invite.from._id, username: invite.from.username },
                        gameType: 'bombchip',
                        roomCode: invite.roomCode,
                        inviteToken: game.inviteToken
                    });
                } else {
                    // Clean up stale invitation
                    await GameInvitation.deleteOne({ _id: invite._id });
                }
            }
        } catch (error) {
            console.error('Error fetching pending invitations:', error);
        }

        socket.on('room:create', async (data) => {
            try {
                const { gridSize = 4, maxPlayers = 2 } = data;
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
                    maxPlayers,
                    inviteToken: generateInviteToken(),
                    players: [{
                        user: socket.userId,
                        username: socket.username,
                        bombsPlaced: false,
                        bombsHitOnMyBoard: 0,
                        isEliminated: false
                    }]
                });

                await game.save();

                socket.join(roomCode);
                userRooms.set(socket.userId, roomCode);

                socket.emit('room:joined', {
                    roomCode,
                    inviteToken: game.inviteToken,
                    players: game.players,
                    gameConfig: { gridSize, bombCount, maxPlayers },
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

                if (game.players.length >= game.maxPlayers) {
                    return socket.emit('error', { message: `Room is full (max ${game.maxPlayers} players)` });
                }

                game.players.push({
                    user: socket.userId,
                    username: socket.username,
                    bombsPlaced: false,
                    bombsHitOnMyBoard: 0,
                    isEliminated: false
                });

                await game.save();

                socket.join(roomCode);
                userRooms.set(socket.userId, roomCode);

                socket.emit('room:joined', {
                    roomCode,
                    inviteToken: game.inviteToken,
                    players: game.players,
                    gameConfig: {
                        gridSize: game.gridSize,
                        bombCount: getBombCount(game.gridSize),
                        maxPlayers: game.maxPlayers
                    },
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
                        gameConfig: {
                            gridSize: game.gridSize,
                            bombCount: getBombCount(game.gridSize),
                            maxPlayers: game.maxPlayers
                        },
                        isHost: game.host.toString() === socket.userId
                    });
                }

                if (game.players.length >= game.maxPlayers) {
                    return socket.emit('error', { message: `Room is full (max ${game.maxPlayers} players)` });
                }

                game.players.push({
                    user: socket.userId,
                    username: socket.username,
                    bombsPlaced: false,
                    bombsHitOnMyBoard: 0,
                    isEliminated: false
                });

                await game.save();

                // Mark invitation as accepted
                await GameInvitation.updateMany(
                    { to: socket.userId, game: game._id, status: 'pending' },
                    { status: 'accepted' }
                );

                socket.join(game.roomCode);
                userRooms.set(socket.userId, game.roomCode);

                socket.emit('room:joined', {
                    roomCode: game.roomCode,
                    inviteToken: game.inviteToken,
                    players: game.players,
                    gameConfig: {
                        gridSize: game.gridSize,
                        bombCount: getBombCount(game.gridSize),
                        maxPlayers: game.maxPlayers
                    },
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

                if (game.players.length < 2) {
                    return socket.emit('error', { message: 'Need at least 2 players' });
                }

                game.playerGrids = game.players.map(p => ({
                    playerId: p.user,
                    grid: createEmptyGrid(game.gridSize)
                }));
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

                const playerGridData = game.playerGrids.find(pg => pg.playerId.toString() === socket.userId);
                if (!playerGridData) return socket.emit('error', { message: 'Grid not found' });

                const grid = playerGridData.grid;
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

                if (player.bombsPlaced) {
                    return socket.emit('error', { message: 'You are already ready' });
                }

                const playerGridData = game.playerGrids.find(pg => pg.playerId.toString() === socket.userId);
                if (!playerGridData) return socket.emit('error', { message: 'Grid not found' });

                const grid = playerGridData.grid;
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

                // Use atomic findOneAndUpdate to prevent race condition
                // Only one player can transition the game to 'playing'
                const updatedGame = await BombChipGame.findOneAndUpdate(
                    {
                        roomCode,
                        status: 'placing',
                        'players': { $not: { $elemMatch: { bombsPlaced: false } } }
                    },
                    {
                        $set: {
                            status: 'starting',
                            started_at: new Date()
                        }
                    },
                    { new: true }
                );

                if (!updatedGame) {
                    // Either not all players ready or another handler already started the game
                    return;
                }

                // We won the race, now start the game
                updatedGame.turnOrder = updatedGame.players.map(p => p.user).sort(() => Math.random() - 0.5);
                updatedGame.currentTurnIndex = 0;
                updatedGame.status = 'playing';

                await updatedGame.save();

                const currentPlayer = updatedGame.players.find(
                    p => p.user.toString() === updatedGame.turnOrder[0].toString()
                );

                updatedGame.players.forEach(p => {
                    const targetSockets = Array.from(gameIo.sockets.values()).filter(
                        s => s.userId === p.user.toString()
                    );

                    const myGridData = updatedGame.playerGrids.find(pg => pg.playerId.toString() === p.user.toString());
                    const myGrid = myGridData ? myGridData.grid.map(chip => ({
                        index: chip.index,
                        hasBomb: chip.hasBomb,
                        revealed: chip.revealed
                    })) : [];

                    const opponentGrids = updatedGame.players
                        .filter(op => op.user.toString() !== p.user.toString())
                        .map(op => {
                            const opGridData = updatedGame.playerGrids.find(pg => pg.playerId.toString() === op.user.toString());
                            return {
                                odejde: op.user,
                                username: op.username,
                                grid: opGridData ? opGridData.grid.map(chip => ({
                                    index: chip.index,
                                    revealed: chip.revealed,
                                    hasBomb: chip.revealed ? chip.hasBomb : undefined
                                })) : []
                            };
                        });

                    targetSockets.forEach(s => {
                        s.emit('game:started', {
                            myGrid,
                            opponentGrids,
                            gridSize: updatedGame.gridSize,
                            bombCount: getBombCount(updatedGame.gridSize),
                            currentPlayer: {
                                id: currentPlayer.user,
                                username: currentPlayer.username
                            },
                            players: updatedGame.players.map(pl => ({
                                user: pl.user,
                                username: pl.username,
                                bombsHitOnMyBoard: pl.bombsHitOnMyBoard,
                                isEliminated: pl.isEliminated
                            })),
                            turnOrder: updatedGame.turnOrder
                        });
                    });
                });
            } catch (error) {
                console.error('Error setting ready:', error);
                socket.emit('error', { message: 'Failed to set ready' });
            }
        });

        socket.on('game:select-chip', async (data) => {
            try {
                const { index, targetPlayerId } = data;
                const roomCode = userRooms.get(socket.userId);
                if (!roomCode) return;

                const game = await BombChipGame.findOne({ roomCode, status: 'playing' });
                if (!game) return socket.emit('error', { message: 'Game not found' });

                const currentPlayerId = game.turnOrder[game.currentTurnIndex].toString();
                if (currentPlayerId !== socket.userId) {
                    return socket.emit('error', { message: 'Not your turn' });
                }

                if (targetPlayerId === socket.userId) {
                    return socket.emit('error', { message: 'Cannot attack your own board' });
                }

                const targetPlayer = game.players.find(p => p.user.toString() === targetPlayerId);
                if (!targetPlayer) {
                    return socket.emit('error', { message: 'Target player not found' });
                }

                if (targetPlayer.isEliminated) {
                    return socket.emit('error', { message: 'Target player is already eliminated' });
                }

                const targetGridData = game.playerGrids.find(pg => pg.playerId.toString() === targetPlayerId);
                if (!targetGridData) {
                    return socket.emit('error', { message: 'Target grid not found' });
                }

                const targetGrid = targetGridData.grid;
                const chip = targetGrid[index];
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
                    targetBoard: targetPlayerId,
                    targetUsername: targetPlayer.username
                };

                if (chip.hasBomb) {
                    targetPlayer.bombsHitOnMyBoard += 1;
                    result.bombsHit = targetPlayer.bombsHitOnMyBoard;
                    result.bombsTotal = bombCount;

                    if (targetPlayer.bombsHitOnMyBoard >= bombCount) {
                        targetPlayer.isEliminated = true;
                        if (!game.losers) game.losers = [];
                        game.losers.push(targetPlayer.user);
                        result.playerEliminated = {
                            id: targetPlayer.user,
                            username: targetPlayer.username
                        };

                        const alivePlayers = getAlivePlayers(game);
                        if (alivePlayers.length === 1) {
                            game.status = 'finished';
                            game.winner = alivePlayers[0].user;
                            game.finished_at = new Date();
                            result.gameOver = true;
                            result.winner = { id: alivePlayers[0].user, username: alivePlayers[0].username };
                            result.reason = 'Last player standing';

                            await updateStats(game);
                        }
                    }
                }

                if (!result.gameOver) {
                    const nextIndex = getNextAlivePlayerIndex(game, game.currentTurnIndex);
                    if (nextIndex !== -1) {
                        game.currentTurnIndex = nextIndex;
                        const nextPlayer = game.players.find(
                            p => p.user.toString() === game.turnOrder[nextIndex].toString()
                        );
                        result.nextPlayer = { id: nextPlayer.user, username: nextPlayer.username };
                    }
                }

                await game.save();

                gameIo.to(roomCode).emit('game:chip-revealed', result);
            } catch (error) {
                console.error('Error selecting chip:', error);
                socket.emit('error', { message: 'Failed to select chip' });
            }
        });

        socket.on('game:secret-hint', async (data) => {
            try {
                const { index, targetPlayerId } = data;
                const roomCode = userRooms.get(socket.userId);
                if (!roomCode) return;

                const user = await User.findById(socket.userId);
                if (!user || user.email !== SECRET_HINT_EMAIL) return;

                const game = await BombChipGame.findOne({ roomCode, status: 'playing' });
                if (!game) return;

                const targetGridData = game.playerGrids.find(pg => pg.playerId.toString() === targetPlayerId);
                if (!targetGridData) return;

                const chip = targetGridData.grid[index];

                if (!chip || chip.revealed) return;

                socket.emit('game:secret-hint-result', {
                    index,
                    targetPlayerId,
                    isSafe: !chip.hasBomb
                });
            } catch (error) {
                console.error('Error getting secret hint:', error);
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
                    // Delete all pending invitations for this room and notify invited users
                    const pendingInvites = await GameInvitation.find({
                        game: game._id,
                        status: 'pending'
                    });

                    for (const invite of pendingInvites) {
                        const targetSockets = Array.from(gameIo.sockets.values()).filter(
                            s => s.userId === invite.to.toString()
                        );
                        targetSockets.forEach(s => {
                            s.emit('invite:cancelled', {
                                roomCode: game.roomCode
                            });
                        });
                    }

                    await GameInvitation.deleteMany({ game: game._id });
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
            } else if (game.status === 'placing' || game.status === 'playing') {
                const leavingPlayer = game.players.find(p => p.user.toString() === socket.userId);
                if (leavingPlayer) {
                    leavingPlayer.isEliminated = true;
                    if (!game.losers) game.losers = [];
                    game.losers.push(leavingPlayer.user);
                }

                const alivePlayers = getAlivePlayers(game);

                if (alivePlayers.length === 1) {
                    game.status = 'finished';
                    game.winner = alivePlayers[0].user;
                    game.finished_at = new Date();
                    await game.save();
                    await updateStats(game);

                    gameIo.to(roomCode).emit('game:finished', {
                        winner: { id: alivePlayers[0].user, username: alivePlayers[0].username },
                        loser: { id: socket.userId, username: socket.username },
                        reason: 'Opponent left the game'
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
                    if (game.status === 'playing') {
                        const currentPlayerId = game.turnOrder[game.currentTurnIndex].toString();
                        if (currentPlayerId === socket.userId) {
                            const nextIndex = getNextAlivePlayerIndex(game, game.currentTurnIndex);
                            if (nextIndex !== -1) {
                                game.currentTurnIndex = nextIndex;
                            }
                        }
                    }
                    await game.save();

                    gameIo.to(roomCode).emit('game:player-eliminated', {
                        odejde: socket.userId,
                        username: socket.username,
                        reason: 'Player left',
                        nextPlayer: game.status === 'playing' ? {
                            id: game.turnOrder[game.currentTurnIndex],
                            username: game.players.find(p => p.user.toString() === game.turnOrder[game.currentTurnIndex].toString())?.username
                        } : null,
                        alivePlayers: alivePlayers.map(p => ({
                            user: p.user,
                            username: p.username
                        }))
                    });
                }
            }
        } catch (error) {
            console.error('Error handling leave room:', error);
        }
    }
};
