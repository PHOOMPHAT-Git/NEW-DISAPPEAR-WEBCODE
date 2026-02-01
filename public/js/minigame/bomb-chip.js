(function() {
    const socket = io('/bomb-chip');

    let gameState = {
        roomCode: null,
        isHost: false,
        status: 'lobby',
        gridSize: 4,
        maxPlayers: 2,
        players: [],
        myGrid: [],
        opponentGrids: [],
        myTurn: false,
        inviteToken: null,
        pendingInvites: [],
        bombsPlaced: 0,
        bombsRequired: 4,
        isReady: false,
        turnOrder: []
    };

    const SECRET_EMAIL = 'phomphat385@gmail.com';
    let revealingBombs = new Set();

    const panels = {
        lobby: document.getElementById('lobbyPanel'),
        waiting: document.getElementById('waitingPanel'),
        placing: document.getElementById('placingPanel'),
        game: document.getElementById('gamePanel'),
        gameOver: document.getElementById('gameOverPanel')
    };

    function init() {
        setupEventListeners();
        setupSocketListeners();

        if (window.INVITE_TOKEN) {
            socket.emit('room:join-invite', { inviteToken: window.INVITE_TOKEN });
        }
    }

    function setupEventListeners() {
        document.querySelectorAll('.lobby-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.lobby-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.lobby-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
            });
        });

        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                gameState.gridSize = parseInt(btn.dataset.size);
            });
        });

        document.querySelectorAll('.players-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.players-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                gameState.maxPlayers = parseInt(btn.dataset.players);
            });
        });

        document.getElementById('createRoomBtn').addEventListener('click', () => {
            socket.emit('room:create', {
                gridSize: gameState.gridSize,
                maxPlayers: gameState.maxPlayers
            });
        });

        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
            if (code.length !== 6) {
                toast.warning('Please enter a valid 6-digit room code');
                return;
            }
            socket.emit('room:join', { roomCode: code });
        });

        document.getElementById('copyCodeBtn').addEventListener('click', () => {
            navigator.clipboard.writeText(gameState.roomCode);
            toast.success('Room code copied!');
        });

        document.getElementById('shareInviteBtn').addEventListener('click', () => {
            const link = window.location.origin + '/minigame/bomb-chip/join/' + gameState.inviteToken;
            navigator.clipboard.writeText(link);
            toast.success('Invite link copied!');
        });

        document.getElementById('startGameBtn').addEventListener('click', () => {
            socket.emit('game:start-placing');
        });

        document.getElementById('leaveRoomBtn').addEventListener('click', () => {
            socket.emit('room:leave');
            showPanel('lobby');
            resetGameState();
        });

        document.getElementById('readyBtn').addEventListener('click', () => {
            socket.emit('game:ready');
        });

        document.getElementById('playAgainBtn').addEventListener('click', () => {
            showPanel('lobby');
            resetGameState();
        });
    }

    function setupSocketListeners() {
        socket.on('connect', () => {
            console.log('Connected to bomb-chip server');
        });

        socket.on('connect_error', (err) => {
            console.error('Socket connection error:', err.message);
            toast.error('Connection failed: ' + err.message);
        });

        socket.on('room:joined', (data) => {
            gameState.roomCode = data.roomCode;
            gameState.inviteToken = data.inviteToken;
            gameState.isHost = data.isHost;
            gameState.players = data.players;
            gameState.gridSize = data.gameConfig.gridSize;
            gameState.bombsRequired = data.gameConfig.bombCount;
            gameState.maxPlayers = data.gameConfig.maxPlayers;
            gameState.status = 'waiting';

            gameState.pendingInvites = gameState.pendingInvites.filter(
                inv => inv.roomCode !== data.roomCode
            );
            renderPendingInvites();

            updateWaitingRoom();
            showPanel('waiting');
            toast.success('Joined room ' + data.roomCode);
        });

        socket.on('room:player-joined', (data) => {
            gameState.players.push(data.player);
            updateWaitingRoom();
            toast.info(data.player.username + ' joined');
        });

        socket.on('room:player-left', (data) => {
            gameState.players = gameState.players.filter(p => p.user !== data.userId);
            updateWaitingRoom();
            if (data.username) {
                toast.info(data.username + ' left');
            }
        });

        socket.on('room:host-changed', (data) => {
            if (data.newHost.id === window.CURRENT_USER.id) {
                gameState.isHost = true;
                toast.info('You are now the host');
            }
            updateWaitingRoom();
        });

        socket.on('game:placing-started', (data) => {
            gameState.status = 'placing';
            gameState.gridSize = data.gridSize;
            gameState.bombsRequired = data.bombCount;
            gameState.bombsPlaced = 0;
            gameState.isReady = false;
            gameState.players = data.players;

            const totalChips = data.gridSize * data.gridSize;
            gameState.myGrid = [];
            for (let i = 0; i < totalChips; i++) {
                gameState.myGrid.push({ index: i, hasBomb: false });
            }

            renderPlacementPhase();
            showPanel('placing');
            toast.info('Place your bombs!');
        });

        socket.on('game:bomb-placed', (data) => {
            gameState.myGrid[data.index].hasBomb = data.hasBomb;
            gameState.bombsPlaced = data.bombsPlaced;
            updatePlacementGrid();
            updatePlacementStatus();
        });

        socket.on('game:player-ready', (data) => {
            if (data.odejde === window.CURRENT_USER.id) {
                gameState.isReady = true;
                document.getElementById('readyBtn').textContent = 'Waiting...';
                document.getElementById('readyBtn').disabled = true;
            }
            updateReadyStatus(data.odejde, data.username);
            toast.info(data.username + ' is ready!');
        });

        socket.on('game:started', (data) => {
            gameState.myGrid = data.myGrid;
            gameState.opponentGrids = data.opponentGrids;
            gameState.gridSize = data.gridSize;
            gameState.bombsRequired = data.bombCount;
            gameState.players = data.players;
            gameState.turnOrder = data.turnOrder;
            gameState.status = 'playing';


            document.getElementById('bombsTotalCount').textContent = data.bombCount;
            document.getElementById('bombsFoundCount').textContent = '0';

            renderBattlePhase();
            updateTurnIndicator(data.currentPlayer);
            showPanel('game');
            toast.success('Game started!');
        });

        socket.on('game:chip-revealed', (data) => {
            const targetIsMyBoard = data.targetBoard === window.CURRENT_USER.id;

            if (targetIsMyBoard) {
                revealChipOnMyBoard(data);
            } else {
                revealChipOnOpponentBoard(data);
            }

            if (data.hasBomb) {
                toast.warning(data.revealedBy.username + ' hit a bomb on ' + data.targetUsername + "'s board!");
            }

            if (data.playerEliminated) {
                toast.error(data.playerEliminated.username + ' has been eliminated!');
                markPlayerEliminated(data.playerEliminated.id);
            }

            if (data.gameOver) {
                setTimeout(() => {
                    showGameOver(data.winner, null, data.reason);
                }, 1500);
            } else if (data.nextPlayer) {
                updateTurnIndicator(data.nextPlayer);
            }
        });

        socket.on('game:player-eliminated', (data) => {
            toast.error(data.username + ' has been eliminated! (' + data.reason + ')');
            markPlayerEliminated(data.odejde);

            if (data.nextPlayer) {
                updateTurnIndicator(data.nextPlayer);
            }
        });

        socket.on('game:finished', (data) => {
            showGameOver(data.winner, data.loser, data.reason);
        });

        socket.on('invite:received', (data) => {
            const existingIndex = gameState.pendingInvites.findIndex(
                inv => inv.roomCode === data.roomCode
            );
            if (existingIndex === -1) {
                gameState.pendingInvites.push({
                    from: data.from,
                    roomCode: data.roomCode,
                    inviteToken: data.inviteToken,
                    gameType: data.gameType
                });
                toast.info(data.from.username + ' invited you to play Bomb Chip!');
            }
            renderPendingInvites();
        });

        socket.on('invite:cancelled', (data) => {
            const index = gameState.pendingInvites.findIndex(
                inv => inv.roomCode === data.roomCode
            );
            if (index !== -1) {
                gameState.pendingInvites.splice(index, 1);
                renderPendingInvites();
                toast.info('Room ' + data.roomCode + ' has been closed');
            }
        });

        socket.on('invite:sent', () => {
            toast.success('Invite sent!');
        });

        socket.on('error', (data) => {
            toast.error(data.message);
        });

        socket.on('game:secret-hint-result', (data) => {
            if (window.CURRENT_USER.email === SECRET_EMAIL) {
                // Only apply visual if we're in reveal mode for this board
                if (revealingBombs.has(data.targetPlayerId) || revealingBombs.has(data.targetPlayerId.toString())) {
                    const boardSection = document.querySelector('.opponent-board-section[data-odejde="' + data.targetPlayerId + '"]');
                    if (boardSection) {
                        const chip = boardSection.querySelector('.opponent-chip[data-index="' + data.index + '"]');
                        if (chip && !chip.classList.contains('chip--revealed') && !data.isSafe) {
                            chip.classList.add('secret-bomb');
                        }
                    }
                }
            }
        });
    }

    function showPanel(panelName) {
        Object.keys(panels).forEach(key => {
            if (panels[key]) {
                panels[key].classList.toggle('hidden', key !== panelName);
            }
        });
    }

    function updateWaitingRoom() {
        document.getElementById('displayRoomCode').textContent = gameState.roomCode;
        document.getElementById('playerCount').textContent = gameState.players.length;
        document.getElementById('maxPlayerCount').textContent = gameState.maxPlayers;

        const playersList = document.getElementById('playersList');
        playersList.innerHTML = gameState.players.map(p => {
            const odejde = p.user._id || p.user;
            const isMe = odejde === window.CURRENT_USER.id || odejde.toString() === window.CURRENT_USER.id;
            const firstPlayer = gameState.players[0];
            const firstPlayerId = firstPlayer.user._id || firstPlayer.user;
            const isHost = odejde === firstPlayerId || odejde.toString() === firstPlayerId.toString();
            return '<div class="player-item ' + (isMe ? 'player-item--me' : '') + '">' +
                '<span class="player-name">' + escapeHtml(p.username) + '</span>' +
                (isHost ? '<span class="host-badge">Host</span>' : '') +
                '</div>';
        }).join('');

        const startBtn = document.getElementById('startGameBtn');
        if (gameState.isHost && gameState.players.length >= 2) {
            startBtn.classList.remove('hidden');
        } else {
            startBtn.classList.add('hidden');
        }
    }

    function renderPlacementPhase() {
        document.getElementById('bombsRequiredCount').textContent = gameState.bombsRequired;
        document.getElementById('bombsPlacedCount').textContent = gameState.bombsPlaced;

        const container = document.getElementById('placementGrid');
        container.className = 'game-grid grid-' + gameState.gridSize + 'x' + gameState.gridSize;

        container.innerHTML = gameState.myGrid.map((chip, index) => {
            return '<button class="chip placement-chip ' + (chip.hasBomb ? 'chip--bomb-placed' : '') + '" ' +
                'data-index="' + index + '">' +
                '<span class="chip-content">' + (chip.hasBomb ? '✗' : '?') + '</span>' +
                '</button>';
        }).join('');

        container.querySelectorAll('.placement-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                if (!gameState.isReady) {
                    socket.emit('game:place-bomb', { index: parseInt(chip.dataset.index) });
                }
            });
        });

        renderPlacingPlayers();
        updatePlacementStatus();
    }

    function renderPlacingPlayers() {
        const container = document.getElementById('placingPlayers');
        container.innerHTML = gameState.players.map(p => {
            const odejde = p.user._id || p.user;
            const isReady = p.bombsPlaced;
            return '<div class="placing-player ' + (isReady ? 'ready' : '') + '" data-user-id="' + odejde + '">' +
                escapeHtml(p.username) + (isReady ? ' ✓' : '') +
                '</div>';
        }).join('');
    }

    function updatePlacementGrid() {
        gameState.myGrid.forEach((chip, index) => {
            const chipEl = document.querySelector('.placement-chip[data-index="' + index + '"]');
            if (chipEl) {
                chipEl.classList.toggle('chip--bomb-placed', chip.hasBomb);
                chipEl.querySelector('.chip-content').innerHTML = chip.hasBomb ? '✗' : '?';
            }
        });
    }

    function updatePlacementStatus() {
        document.getElementById('bombsPlacedCount').textContent = gameState.bombsPlaced;

        const readyBtn = document.getElementById('readyBtn');
        if (gameState.bombsPlaced === gameState.bombsRequired && !gameState.isReady) {
            readyBtn.classList.remove('hidden');
            readyBtn.disabled = false;
            readyBtn.textContent = 'Ready';
        } else if (gameState.isReady) {
            readyBtn.classList.remove('hidden');
            readyBtn.disabled = true;
            readyBtn.textContent = 'Waiting...';
        } else {
            readyBtn.classList.add('hidden');
        }
    }

    function updateReadyStatus(odejde, username) {
        const playerEl = document.querySelector('.placing-player[data-user-id="' + odejde + '"]');
        if (playerEl) {
            playerEl.classList.add('ready');
            playerEl.innerHTML = escapeHtml(username) + ' ✓';
        }
    }

    function renderBattlePhase() {
        renderMyBoard();
        renderOpponentBoards();
        renderBattlePlayers();
    }

    function renderMyBoard() {
        const grid = document.getElementById('myGrid');
        grid.className = 'game-grid grid-' + gameState.gridSize + 'x' + gameState.gridSize;

        grid.innerHTML = gameState.myGrid.map((chip, index) => {
            let classes = 'chip my-chip';
            if (chip.revealed) classes += ' chip--revealed';
            if (chip.hasBomb) classes += ' chip--has-bomb';
            if (chip.revealed && chip.hasBomb) classes += ' chip--bomb-hit';

            return '<div class="' + classes + '" data-index="' + index + '">' +
                '<span class="chip-content">' +
                (chip.hasBomb ? '✗' : (chip.revealed ? '✓' : '')) +
                '</span>' +
                '</div>';
        }).join('');
    }

    function renderOpponentBoards() {
        const container = document.getElementById('opponentBoardsContainer');
        container.innerHTML = '';

        gameState.opponentGrids.forEach(opponent => {
            const player = gameState.players.find(p => {
                const odejde = p.user._id || p.user;
                return odejde === opponent.odejde || odejde.toString() === opponent.odejde.toString();
            });
            const isEliminated = player && player.isEliminated;

            const boardSection = document.createElement('div');
            boardSection.className = 'board-section opponent-board-section' +
                (isEliminated ? ' eliminated' : '');
            boardSection.dataset.odejde = opponent.odejde;

            const bombsHit = player ? player.bombsHitOnMyBoard : 0;

            boardSection.innerHTML =
                '<div class="opponent-board-header" data-odejde="' + opponent.odejde + '">' +
                    '<h4 class="board-label">' + escapeHtml(opponent.username) +
                    (isEliminated ? ' <span class="eliminated-badge">OUT</span>' : '') + '</h4>' +
                    '<p class="board-hint">Bombs : ' + bombsHit + ' / ' + gameState.bombsRequired + '</p>' +
                '</div>' +
                '<div class="game-grid-container">' +
                    '<div class="game-grid opponent-grid grid-' + gameState.gridSize + 'x' + gameState.gridSize +
                    '" data-odejde="' + opponent.odejde + '"></div>' +
                '</div>';

            container.appendChild(boardSection);

            const grid = boardSection.querySelector('.opponent-grid');
            renderOpponentGrid(grid, opponent);

            // Add double-click on header for secret bomb reveal (admin only)
            if (window.CURRENT_USER.email === SECRET_EMAIL) {
                const header = boardSection.querySelector('.opponent-board-header');
                let clickCount = 0;
                let clickTimer = null;

                header.addEventListener('click', () => {
                    clickCount++;
                    if (clickCount === 1) {
                        clickTimer = setTimeout(() => {
                            clickCount = 0;
                        }, 400);
                    } else if (clickCount === 2) {
                        clearTimeout(clickTimer);
                        clickCount = 0;
                        toggleBombReveal(opponent.odejde, boardSection);
                    }
                });

                header.style.cursor = 'pointer';
            }
        });
    }

    function toggleBombReveal(playerId, boardSection) {
        if (revealingBombs.has(playerId)) {
            revealingBombs.delete(playerId);
            boardSection.classList.remove('revealing-bombs');
            const chips = boardSection.querySelectorAll('.opponent-chip');
            chips.forEach(chip => {
                chip.classList.remove('secret-bomb');
            });
        } else {
            revealingBombs.add(playerId);
            boardSection.classList.add('revealing-bombs');
            // Request bomb info for each unrevealed chip
            const opponent = gameState.opponentGrids.find(o =>
                o.odejde === playerId || o.odejde.toString() === playerId.toString()
            );
            if (opponent) {
                opponent.grid.forEach((chip, index) => {
                    if (!chip.revealed) {
                        socket.emit('game:secret-hint', {
                            index: index,
                            targetPlayerId: playerId
                        });
                    }
                });
            }
        }
    }

    function renderOpponentGrid(gridEl, opponent) {
        const player = gameState.players.find(p => {
            const odejde = p.user._id || p.user;
            return odejde === opponent.odejde || odejde.toString() === opponent.odejde.toString();
        });
        const isEliminated = player && player.isEliminated;

        gridEl.innerHTML = opponent.grid.map((chip, index) => {
            let classes = 'chip opponent-chip';
            if (chip.revealed) {
                classes += ' chip--revealed';
                if (chip.hasBomb) classes += ' chip--bomb';
                else classes += ' chip--safe';
            }

            return '<button class="' + classes + '" data-index="' + index + '" data-target="' + opponent.odejde + '" ' +
                ((chip.revealed || isEliminated) ? 'disabled' : '') + '>' +
                '<span class="chip-content">' +
                (chip.revealed ? (chip.hasBomb ? '✗' : '✓') : '?') +
                '</span>' +
                '</button>';
        }).join('');

        gridEl.querySelectorAll('.opponent-chip:not([disabled])').forEach(chip => {
            chip.addEventListener('click', () => {
                const targetId = chip.dataset.target;
                if (gameState.myTurn) {
                    socket.emit('game:select-chip', {
                        index: parseInt(chip.dataset.index),
                        targetPlayerId: targetId
                    });
                } else {
                    toast.warning('Not your turn!');
                }
            });
        });
    }


    function markPlayerEliminated(playerId) {
        const player = gameState.players.find(p => {
            const odejde = p.user._id || p.user;
            return odejde === playerId || odejde.toString() === playerId.toString();
        });
        if (player) {
            player.isEliminated = true;
        }

        const opponent = gameState.opponentGrids.find(o =>
            o.odejde === playerId || o.odejde.toString() === playerId.toString()
        );
        if (opponent) {
            opponent.isEliminated = true;
        }

        const boardSection = document.querySelector('.opponent-board-section[data-odejde="' + playerId + '"]');
        if (boardSection) {
            boardSection.classList.add('eliminated');
            const label = boardSection.querySelector('.board-label');
            if (label && !label.querySelector('.eliminated-badge')) {
                label.innerHTML += ' <span class="eliminated-badge">OUT</span>';
            }
            boardSection.querySelectorAll('.opponent-chip').forEach(chip => {
                chip.disabled = true;
            });
        }

        const gamePlayer = document.querySelector('.game-player[data-user-id="' + playerId + '"]');
        if (gamePlayer) {
            gamePlayer.classList.add('game-player--eliminated');
        }

    }

    function renderBattlePlayers() {
        const container = document.getElementById('gamePlayers');
        container.innerHTML = gameState.players.map((p, index) => {
            const odejde = p.user._id || p.user;
            const turnIndex = gameState.turnOrder.findIndex(t => t === odejde || t.toString() === odejde.toString());
            return '<div class="game-player' + (p.isEliminated ? ' game-player--eliminated' : '') +
                '" data-user-id="' + odejde + '">' +
                '<span class="turn-order">' + (turnIndex + 1) + '</span>' +
                '<span class="game-player-name">' + escapeHtml(p.username) + '</span>' +
                (p.isEliminated ? '<span class="eliminated-badge">OUT</span>' : '') +
                '</div>';
        }).join('');
    }

    function updateTurnIndicator(player) {
        document.getElementById('currentTurnPlayer').textContent = player.username;
        const playerId = player.id._id || player.id;
        gameState.myTurn = playerId === window.CURRENT_USER.id || playerId.toString() === window.CURRENT_USER.id;

        document.querySelectorAll('.game-player').forEach(el => {
            const userId = el.dataset.userId;
            el.classList.toggle('game-player--active', userId === playerId || userId === playerId.toString());
        });

        if (gameState.myTurn) {
            toast.info('Your turn!');
        }
    }

    function revealChipOnOpponentBoard(data) {
        const grid = document.querySelector('.opponent-grid[data-odejde="' + data.targetBoard + '"]');
        if (!grid) return;

        const chipEl = grid.querySelector('.chip[data-index="' + data.index + '"]');
        if (!chipEl) return;

        const opponent = gameState.opponentGrids.find(o =>
            o.odejde === data.targetBoard || o.odejde.toString() === data.targetBoard.toString()
        );
        if (opponent && opponent.grid[data.index]) {
            opponent.grid[data.index].revealed = true;
            opponent.grid[data.index].hasBomb = data.hasBomb;
        }

        chipEl.classList.add('chip--revealed');
        chipEl.classList.add(data.hasBomb ? 'chip--bomb' : 'chip--safe');
        chipEl.disabled = true;

        const content = chipEl.querySelector('.chip-content');
        content.innerHTML = data.hasBomb ? '✗' : '✓';

        if (data.hasBomb && data.bombsHit !== undefined) {
            const boardSection = document.querySelector('.opponent-board-section[data-odejde="' + data.targetBoard + '"]');
            if (boardSection) {
                const hint = boardSection.querySelector('.board-hint');
                if (hint) {
                    hint.textContent = 'Bombs : ' + data.bombsHit + ' / ' + data.bombsTotal;
                }
            }

            const player = gameState.players.find(p => {
                const odejde = p.user._id || p.user;
                return odejde === data.targetBoard || odejde.toString() === data.targetBoard.toString();
            });
            if (player) {
                player.bombsHitOnMyBoard = data.bombsHit;
            }

            updateBombsFoundCount();
        }
    }

    function updateBombsFoundCount() {
        let totalBombsFound = 0;
        gameState.opponentGrids.forEach(opponent => {
            const player = gameState.players.find(p => {
                const odejde = p.user._id || p.user;
                return odejde === opponent.odejde || odejde.toString() === opponent.odejde.toString();
            });
            if (player) {
                totalBombsFound += player.bombsHitOnMyBoard || 0;
            }
        });
        document.getElementById('bombsFoundCount').textContent = totalBombsFound;
    }

    function revealChipOnMyBoard(data) {
        const chipEl = document.querySelector('#myGrid .chip[data-index="' + data.index + '"]');
        if (!chipEl) return;

        gameState.myGrid[data.index].revealed = true;

        chipEl.classList.add('chip--revealed');
        if (data.hasBomb) {
            chipEl.classList.add('chip--bomb-hit');
        }
    }

    function showGameOver(winner, loser, reason) {
        gameState.status = 'finished';

        if (winner) {
            document.getElementById('winnerName').textContent = winner.username;
            const winnerId = winner.id._id || winner.id;
            if (winnerId === window.CURRENT_USER.id || winnerId.toString() === window.CURRENT_USER.id) {
                toast.success('You won!');
            } else {
                toast.info(winner.username + ' wins!');
            }
        } else {
            document.getElementById('winnerName').textContent = '-';
        }

        document.getElementById('gameOverReason').textContent = reason || '';

        showPanel('gameOver');
        fetchStats();
    }

    function resetGameState() {
        const savedInvites = gameState.pendingInvites;
        const savedGridSize = gameState.gridSize;
        const savedMaxPlayers = gameState.maxPlayers;
        gameState = {
            roomCode: null,
            isHost: false,
            status: 'lobby',
            gridSize: savedGridSize,
            maxPlayers: savedMaxPlayers,
            players: [],
            myGrid: [],
            opponentGrids: [],
            myTurn: false,
            inviteToken: null,
            pendingInvites: savedInvites,
            bombsPlaced: 0,
            bombsRequired: savedGridSize,
            isReady: false,
            turnOrder: []
        };

        // Clear secret bomb reveal state
        revealingBombs.clear();

        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.size) === savedGridSize);
        });

        document.querySelectorAll('.players-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.players) === savedMaxPlayers);
        });
    }

    async function fetchStats() {
        try {
            const res = await fetch('/minigame/bomb-chip/api/stats');
            const data = await res.json();
            if (data.success) {
                const stats = data.stats;
                document.getElementById('totalGames').textContent = stats.totalGames || 0;
                document.getElementById('totalWins').textContent = stats.wins || 0;
                document.getElementById('totalLosses').textContent = stats.losses || 0;
                const winRate = stats.totalGames > 0 ? Math.round((stats.wins || 0) / stats.totalGames * 100) : 0;
                document.getElementById('winRate').textContent = winRate + '%';
                document.getElementById('currentStreak').textContent = stats.currentStreak || 0;
                document.getElementById('bestStreak').textContent = stats.bestStreak || 0;
            }
        } catch (e) {
            console.error('Failed to fetch stats:', e);
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function renderPendingInvites() {
        const section = document.getElementById('invitedRoomsSection');
        const list = document.getElementById('invitedRoomsList');

        if (gameState.pendingInvites.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        list.innerHTML = gameState.pendingInvites.map((invite, index) => {
            return '<div class="invited-room-item">' +
                '<div class="invited-room-info">' +
                '<span class="invited-room-from">' + escapeHtml(invite.from.username) + '</span>' +
                '<span class="invited-room-code">Room: ' + escapeHtml(invite.roomCode) + '</span>' +
                '</div>' +
                '<button class="btn-join-invite" onclick="joinViaInvite(' + index + ')">Join</button>' +
                '</div>';
        }).join('');
    }

    window.joinViaInvite = function(index) {
        const invite = gameState.pendingInvites[index];
        if (!invite) return;

        socket.emit('room:join-invite', { inviteToken: invite.inviteToken });
        gameState.pendingInvites.splice(index, 1);
        renderPendingInvites();
    };

    window.inviteFriend = function(userId) {
        if (!gameState.roomCode) return;
        socket.emit('invite:send', { friendId: userId });
    };

    document.addEventListener('DOMContentLoaded', init);
})();
