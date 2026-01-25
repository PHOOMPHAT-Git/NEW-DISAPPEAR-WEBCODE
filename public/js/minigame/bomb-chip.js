(function() {
    const socket = io('/bomb-chip');

    let gameState = {
        roomCode: null,
        isHost: false,
        status: 'lobby',
        gridSize: 4,
        bombCount: 4,
        players: [],
        grid: [],
        myTurn: false,
        inviteToken: null
    };

    const panels = {
        lobby: document.getElementById('lobbyPanel'),
        waiting: document.getElementById('waitingPanel'),
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
                updateBombSlider();
            });
        });

        const bombSlider = document.getElementById('bombCount');
        bombSlider.addEventListener('input', () => {
            gameState.bombCount = parseInt(bombSlider.value);
            document.getElementById('bombCountDisplay').textContent = bombSlider.value;
        });

        document.getElementById('createRoomBtn').addEventListener('click', () => {
            socket.emit('room:create', {
                gridSize: gameState.gridSize,
                bombCount: gameState.bombCount
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
            socket.emit('game:start');
        });

        document.getElementById('leaveRoomBtn').addEventListener('click', () => {
            socket.emit('room:leave');
            showPanel('lobby');
            resetGameState();
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
            gameState.bombCount = data.gameConfig.bombCount;
            gameState.status = 'waiting';

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

        socket.on('game:started', (data) => {
            gameState.grid = data.grid;
            gameState.players = data.players;
            gameState.status = 'playing';

            renderGameGrid();
            renderGamePlayers();
            updateTurnIndicator(data.currentPlayer);
            showPanel('game');
        });

        socket.on('game:chip-revealed', (data) => {
            revealChip(data);

            if (data.eliminated) {
                toast.warning(data.eliminated.username + ' hit a bomb!');
                updatePlayerStatus(data.eliminated.id, false);
            }

            if (data.gameOver) {
                setTimeout(() => {
                    showGameOver(data.winner);
                }, 1500);
            } else if (data.nextPlayer) {
                updateTurnIndicator(data.nextPlayer);
            }
        });

        socket.on('game:finished', (data) => {
            showGameOver(data.winner);
        });

        socket.on('game:player-left', (data) => {
            updatePlayerStatus(data.userId, false);
            if (data.nextPlayer) {
                updateTurnIndicator(data.nextPlayer);
            }
            toast.info(data.username + ' left the game');
        });

        socket.on('invite:received', (data) => {
            toast.info(data.from.username + ' invited you to play BombChip!');
        });

        socket.on('invite:sent', () => {
            toast.success('Invite sent!');
        });

        socket.on('error', (data) => {
            toast.error(data.message);
        });
    }

    function showPanel(panelName) {
        Object.keys(panels).forEach(key => {
            panels[key].classList.toggle('hidden', key !== panelName);
        });
    }

    function updateBombSlider() {
        const totalChips = gameState.gridSize * gameState.gridSize;
        const maxBombs = Math.floor(totalChips * 0.5);
        const defaultBombs = Math.floor(totalChips * 0.25);

        const slider = document.getElementById('bombCount');
        slider.max = maxBombs;
        slider.value = defaultBombs;
        gameState.bombCount = defaultBombs;
        document.getElementById('bombCountDisplay').textContent = defaultBombs;
    }

    function updateWaitingRoom() {
        document.getElementById('displayRoomCode').textContent = gameState.roomCode;
        document.getElementById('playerCount').textContent = gameState.players.length;

        const playersList = document.getElementById('playersList');
        playersList.innerHTML = gameState.players.map(p => {
            const isMe = p.user === window.CURRENT_USER.id || p.user.toString() === window.CURRENT_USER.id;
            const isHost = gameState.players[0] && (p.user === gameState.players[0].user || p.user.toString() === gameState.players[0].user.toString());
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

    function renderGameGrid() {
        const grid = document.getElementById('gameGrid');
        grid.className = 'game-grid grid-' + gameState.gridSize + 'x' + gameState.gridSize;

        grid.innerHTML = gameState.grid.map((chip, index) => {
            return '<button class="chip ' + (chip.revealed ? 'chip--revealed' : '') + '" ' +
                'data-index="' + index + '" ' +
                (chip.revealed ? 'disabled' : '') + '>' +
                '<span class="chip-content">?</span>' +
                '</button>';
        }).join('');

        grid.querySelectorAll('.chip:not([disabled])').forEach(chip => {
            chip.addEventListener('click', () => {
                if (gameState.myTurn) {
                    socket.emit('game:select-chip', { index: parseInt(chip.dataset.index) });
                } else {
                    toast.warning('Not your turn!');
                }
            });
        });
    }

    function renderGamePlayers() {
        const container = document.getElementById('gamePlayers');
        container.innerHTML = gameState.players.map(p => {
            return '<div class="game-player ' + (p.isAlive ? '' : 'game-player--eliminated') + '" data-user-id="' + p.user + '">' +
                '<span class="game-player-name">' + escapeHtml(p.username) + '</span>' +
                '<span class="game-player-status">' + (p.isAlive ? 'Alive' : 'Eliminated') + '</span>' +
                '</div>';
        }).join('');
    }

    function updateTurnIndicator(player) {
        document.getElementById('currentTurnPlayer').textContent = player.username;
        gameState.myTurn = player.id === window.CURRENT_USER.id || player.id.toString() === window.CURRENT_USER.id;

        document.querySelectorAll('.game-player').forEach(el => {
            const userId = el.dataset.userId;
            el.classList.toggle('game-player--active', userId === player.id || userId === player.id.toString());
        });

        if (gameState.myTurn) {
            toast.info('Your turn!');
        }
    }

    function revealChip(data) {
        const chipEl = document.querySelector('.chip[data-index="' + data.index + '"]');
        if (!chipEl) return;

        chipEl.classList.add('chip--revealed');
        chipEl.classList.add(data.hasBomb ? 'chip--bomb' : 'chip--safe');
        chipEl.disabled = true;

        const content = chipEl.querySelector('.chip-content');
        if (data.hasBomb) {
            content.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>';
        } else {
            content.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        }
    }

    function updatePlayerStatus(userId, isAlive) {
        const playerEl = document.querySelector('.game-player[data-user-id="' + userId + '"]');
        if (playerEl) {
            playerEl.classList.toggle('game-player--eliminated', !isAlive);
            playerEl.querySelector('.game-player-status').textContent = isAlive ? 'Alive' : 'Eliminated';
        }

        const player = gameState.players.find(p => p.user === userId || p.user.toString() === userId);
        if (player) {
            player.isAlive = isAlive;
        }
    }

    function showGameOver(winner) {
        gameState.status = 'finished';
        if (winner) {
            document.getElementById('winnerName').textContent = winner.username;
            if (winner.id === window.CURRENT_USER.id || winner.id.toString() === window.CURRENT_USER.id) {
                toast.success('You won!');
            } else {
                toast.info(winner.username + ' wins!');
            }
        } else {
            document.getElementById('winnerName').textContent = 'No one';
        }
        showPanel('gameOver');
        fetchStats();
    }

    function resetGameState() {
        gameState = {
            roomCode: null,
            isHost: false,
            status: 'lobby',
            gridSize: 4,
            bombCount: 4,
            players: [],
            grid: [],
            myTurn: false,
            inviteToken: null
        };
    }

    async function fetchStats() {
        try {
            const res = await fetch('/minigame/bomb-chip/api/stats');
            const data = await res.json();
            if (data.success) {
                document.getElementById('currentStreak').textContent = data.stats.currentStreak || 0;
                document.getElementById('bestStreak').textContent = data.stats.bestStreak || 0;
                document.getElementById('totalWins').textContent = data.stats.wins || 0;
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

    window.inviteFriend = function(userId) {
        if (!gameState.roomCode) return;
        socket.emit('invite:send', { friendId: userId });
    };

    document.addEventListener('DOMContentLoaded', init);
})();
