class MultiplayerDiceGame {
    constructor() {
        this.socket = io();
        this.playerId = null;
        this.playerName = '';
        this.gameState = {
            players: {},
            currentTurn: null,
            gameStatus: 'waiting'
        };
        this.isRolling = false;
        
        this.initializeElements();
        this.bindEvents();
        this.setupSocketListeners();
        this.updateConnectionStatus('connecting');
    }

    initializeElements() {
        // 화면 요소들
        this.startScreen = document.getElementById('startScreen');
        this.gameScreen = document.getElementById('gameScreen');
        this.endScreen = document.getElementById('endScreen');
        
        // 입력 요소들
        this.playerNameInput = document.getElementById('playerName');
        this.joinGameBtn = document.getElementById('joinGameBtn');
        this.waitingMessage = document.getElementById('waitingMessage');
        
        // 게임 요소들
        this.playerNameDisplay = document.getElementById('playerNameDisplay');
        this.currentTurnDisplay = document.getElementById('currentTurn');
        this.currentPlayerName = document.getElementById('currentPlayerName');
        this.dice = document.getElementById('dice');
        this.rollDiceBtn = document.getElementById('rollDiceBtn');
        
        // 플레이어 점수 요소들
        this.player1Name = document.getElementById('player1Name');
        this.player1Total = document.getElementById('player1Total');
        this.player1History = document.getElementById('player1History');
        this.player2Name = document.getElementById('player2Name');
        this.player2Total = document.getElementById('player2Total');
        this.player2History = document.getElementById('player2History');
        
        // 게임 상태 요소들
        this.gameStatusMessage = document.getElementById('gameStatusMessage');
        
        // 결과 요소들
        this.winnerDisplay = document.getElementById('winnerDisplay');
        this.finalScoresList = document.getElementById('finalScoresList');
        this.newGameBtn = document.getElementById('newGameBtn');
        
        // 연결 상태 요소들
        this.connectionStatus = document.getElementById('connectionStatus');
        this.connectionText = document.getElementById('connectionText');
    }

    bindEvents() {
        this.joinGameBtn.addEventListener('click', () => this.joinGame());
        this.rollDiceBtn.addEventListener('click', () => this.rollDice());
        this.newGameBtn.addEventListener('click', () => this.newGame());
        
        // Enter 키로 게임 참가
        this.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinGame();
            }
        });
    }

    setupSocketListeners() {
        // 연결 이벤트
        this.socket.on('connect', () => {
            console.log('Socket.IO 연결됨:', this.socket.id);
            this.updateConnectionStatus('connected');
        });

        this.socket.on('disconnect', () => {
            console.log('Socket.IO 연결 끊김');
            this.updateConnectionStatus('disconnected');
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket.IO 연결 오류:', error);
        });

        // 게임 이벤트
        this.socket.on('game_full', () => {
            alert('게임방이 가득 찼습니다. 잠시 후 다시 시도해주세요.');
        });

        this.socket.on('game_state_update', (data) => {
            this.gameState = data;
            this.updateGameDisplay();
        });

        this.socket.on('game_start', (data) => {
            console.log('게임 시작됨:', data);
            this.gameState = data;
            this.showScreen('gameScreen');
            this.updateGameDisplay();
            this.gameStatusMessage.textContent = '게임이 시작되었습니다!';
        });

        this.socket.on('dice_rolled', (data) => {
            this.handleDiceRolled(data);
        });

        this.socket.on('turn_change', (data) => {
            this.gameState = data;
            this.updateGameDisplay();
            this.gameStatusMessage.textContent = `${data.players[data.currentTurn]?.name || '플레이어'}의 차례입니다.`;
        });

        this.socket.on('game_end', (data) => {
            this.gameState = data;
            this.showGameEnd(data.result);
        });

        this.socket.on('game_reset', () => {
            this.resetGame();
        });

        this.socket.on('player_disconnected', (data) => {
            this.gameState = data;
            this.updateGameDisplay();
            this.gameStatusMessage.textContent = '상대방이 연결을 끊었습니다.';
        });
    }

    joinGame() {
        const name = this.playerNameInput.value.trim();
        if (!name) {
            alert('이름을 입력해주세요!');
            return;
        }

        this.playerName = name;
        this.playerNameDisplay.textContent = name;
        this.joinGameBtn.disabled = true;
        this.waitingMessage.classList.remove('hidden');
        
        this.socket.emit('join_game', { playerName: name });
    }

    async rollDice() {
        console.log('rollDice 호출됨');
        console.log('현재 상태:', {
            isRolling: this.isRolling,
            currentTurn: this.gameState.currentTurn,
            myId: this.socket.id,
            gameStatus: this.gameState.gameStatus
        });
        
        if (this.isRolling || this.gameState.currentTurn !== this.socket.id) {
            console.log('주사위 굴리기 조건 불만족');
            return;
        }

        console.log('주사위 굴리기 시작');
        this.isRolling = true;
        this.rollDiceBtn.disabled = true;
        this.dice.classList.add('rolling');

        // 주사위 굴리기 애니메이션
        await this.animateDiceRoll();

        // 서버에 주사위 굴리기 요청
        console.log('서버에 roll_dice 이벤트 전송');
        this.socket.emit('roll_dice');
    }

    async animateDiceRoll() {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                const randomNum = Math.floor(Math.random() * 6) + 1;
                this.dice.textContent = randomNum;
            }, 100);

            setTimeout(() => {
                clearInterval(interval);
                resolve();
            }, 600);
        });
    }

    handleDiceRolled(data) {
        // 애니메이션 종료 후 결과 표시
        setTimeout(() => {
            this.dice.textContent = data.diceResult;
            this.dice.classList.remove('rolling');
            
            // 게임 상태 업데이트
            if (this.gameState.players[data.playerId]) {
                this.gameState.players[data.playerId].totalScore = data.totalScore;
                this.gameState.players[data.playerId].currentTurn = data.currentTurn;
                this.gameState.players[data.playerId].diceHistory.push(data.diceResult);
            }
            
            this.updateGameDisplay();
            this.gameStatusMessage.textContent = `${data.playerName}이(가) ${data.diceResult}을(를) 굴렸습니다!`;
            
            this.isRolling = false;
            if (this.gameState.currentTurn === this.socket.id) {
                this.rollDiceBtn.disabled = false;
            }
        }, 600);
    }

    updateGameDisplay() {
        const playerIds = Object.keys(this.gameState.players);
        
        if (playerIds.length >= 1) {
            const player1 = this.gameState.players[playerIds[0]];
            this.player1Name.textContent = player1.name;
            this.player1Total.textContent = player1.totalScore;
            this.updateDiceHistory(this.player1History, player1.diceHistory);
        }
        
        if (playerIds.length >= 2) {
            const player2 = this.gameState.players[playerIds[1]];
            this.player2Name.textContent = player2.name;
            this.player2Total.textContent = player2.totalScore;
            this.updateDiceHistory(this.player2History, player2.diceHistory);
        }
        
        // 현재 턴 표시
        if (this.gameState.currentTurn) {
            const currentPlayer = this.gameState.players[this.gameState.currentTurn];
            this.currentPlayerName.textContent = currentPlayer ? currentPlayer.name : '플레이어';
            
            // 현재 턴 플레이어 하이라이트
            this.player1Score.classList.toggle('current-turn', playerIds[0] === this.gameState.currentTurn);
            this.player2Score.classList.toggle('current-turn', playerIds[1] === this.gameState.currentTurn);
        }
        
        // 주사위 굴리기 버튼 활성화/비활성화
        const isMyTurn = this.gameState.currentTurn === this.socket.id;
        const canRoll = this.gameState.gameStatus === 'playing' && isMyTurn && !this.isRolling;
        this.rollDiceBtn.disabled = !canRoll;
        
        console.log('버튼 상태 업데이트:', {
            isMyTurn,
            gameStatus: this.gameState.gameStatus,
            isRolling: this.isRolling,
            canRoll,
            buttonDisabled: !canRoll
        });
        
        // 현재 턴 표시
        if (this.gameState.players[this.socket.id]) {
            this.currentTurnDisplay.textContent = this.gameState.players[this.socket.id].currentTurn;
        }
    }

    updateDiceHistory(container, history) {
        container.innerHTML = '';
        history.forEach(diceValue => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.textContent = diceValue;
            container.appendChild(historyItem);
        });
    }

    showGameEnd(result) {
        this.winnerDisplay.innerHTML = '';
        this.finalScoresList.innerHTML = '';
        
        if (result.type === 'winner') {
            this.winnerDisplay.textContent = `🏆 ${result.winner.name}이(가) 승리했습니다!`;
            this.winnerDisplay.className = 'winner';
        } else if (result.type === 'draw') {
            this.winnerDisplay.textContent = '🤝 무승부입니다!';
            this.winnerDisplay.className = 'draw';
        }
        
        // 최종 점수 표시
        result.players.forEach(player => {
            const scoreItem = document.createElement('div');
            scoreItem.className = 'final-score-item';
            scoreItem.innerHTML = `
                <h4>${player.name}</h4>
                <p>${player.score}점</p>
            `;
            this.finalScoresList.appendChild(scoreItem);
        });
        
        this.showScreen('endScreen');
    }

    newGame() {
        this.socket.emit('new_game');
    }

    resetGame() {
        this.gameState = {
            players: {},
            currentTurn: null,
            gameStatus: 'waiting'
        };
        
        this.isRolling = false;
        this.dice.textContent = '1';
        this.dice.classList.remove('rolling');
        
        this.showScreen('startScreen');
        this.joinGameBtn.disabled = false;
        this.waitingMessage.classList.add('hidden');
        this.playerNameInput.value = '';
        this.playerNameInput.focus();
    }

    showScreen(screenId) {
        this.startScreen.classList.add('hidden');
        this.gameScreen.classList.add('hidden');
        this.endScreen.classList.add('hidden');
        
        document.getElementById(screenId).classList.remove('hidden');
    }

    updateConnectionStatus(status) {
        this.connectionStatus.className = `connection-status ${status}`;
        
        switch (status) {
            case 'connected':
                this.connectionText.textContent = '연결됨';
                break;
            case 'disconnected':
                this.connectionText.textContent = '연결 끊김';
                break;
            case 'connecting':
                this.connectionText.textContent = '연결 중...';
                break;
        }
    }
}

// 게임 시작
document.addEventListener('DOMContentLoaded', () => {
    new MultiplayerDiceGame();
});
