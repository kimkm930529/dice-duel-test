const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 미들웨어 설정
app.use(cors());
app.use(express.static(path.join(__dirname, '../client')));

// 게임 상태 관리
const gameState = {
    players: {},
    currentTurn: null,
    gameStatus: 'waiting', // waiting, playing, finished
    maxPlayers: 2,
    currentPlayerIndex: 0,
    playerOrder: []
};

// 주사위 굴리기 함수
function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
}

// 게임 상태 초기화
function initializeGame() {
    gameState.gameStatus = 'playing';
    gameState.currentPlayerIndex = 0;
    gameState.currentTurn = gameState.playerOrder[0];
    
    // 모든 플레이어의 게임 상태 초기화
    gameState.playerOrder.forEach(playerId => {
        gameState.players[playerId] = {
            ...gameState.players[playerId],
            currentTurn: 1,
            totalScore: 0,
            diceHistory: []
        };
    });
}

// 다음 플레이어로 턴 변경
function nextTurn() {
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.playerOrder.length;
    gameState.currentTurn = gameState.playerOrder[gameState.currentPlayerIndex];
}

// 게임 종료 확인
function checkGameEnd() {
    const allPlayersFinished = gameState.playerOrder.every(playerId => 
        gameState.players[playerId].currentTurn > 3
    );
    
    if (allPlayersFinished) {
        gameState.gameStatus = 'finished';
        return true;
    }
    return false;
}

// 승자 결정
function determineWinner() {
    const scores = gameState.playerOrder.map(playerId => ({
        playerId,
        name: gameState.players[playerId].name,
        score: gameState.players[playerId].totalScore
    }));
    
    scores.sort((a, b) => b.score - a.score);
    
    if (scores[0].score === scores[1].score) {
        return { type: 'draw', players: scores };
    } else {
        return { type: 'winner', winner: scores[0], loser: scores[1] };
    }
}

// Socket.IO 연결 관리
io.on('connection', (socket) => {
    console.log('플레이어 연결:', socket.id);

    // 게임 참가
    socket.on('join_game', (data) => {
        const { playerName } = data;
        
        // 이미 최대 플레이어 수에 도달한 경우
        if (Object.keys(gameState.players).length >= gameState.maxPlayers) {
            socket.emit('game_full');
            return;
        }
        
        // 플레이어 추가
        gameState.players[socket.id] = {
            name: playerName,
            currentTurn: 1,
            totalScore: 0,
            diceHistory: []
        };
        
        gameState.playerOrder.push(socket.id);
        
        console.log(`플레이어 ${playerName} (${socket.id}) 게임 참가`);
        
        // 모든 플레이어에게 게임 상태 업데이트
        io.emit('game_state_update', {
            players: gameState.players,
            gameStatus: gameState.gameStatus,
            currentTurn: gameState.currentTurn
        });
        
        // 두 명의 플레이어가 모두 참가하면 게임 시작
        if (gameState.playerOrder.length === gameState.maxPlayers) {
            initializeGame();
            io.emit('game_start', {
                players: gameState.players,
                currentTurn: gameState.currentTurn
            });
        }
    });

    // 주사위 굴리기
    socket.on('roll_dice', () => {
        console.log(`주사위 굴리기 요청: ${socket.id}`);
        console.log('게임 상태:', {
            currentTurn: gameState.currentTurn,
            gameStatus: gameState.gameStatus,
            requestingPlayer: socket.id
        });
        
        // 현재 턴이 아니거나 게임이 끝났으면 무시
        if (gameState.currentTurn !== socket.id || gameState.gameStatus !== 'playing') {
            console.log('주사위 굴리기 거부됨');
            return;
        }
        
        const player = gameState.players[socket.id];
        
        // 이미 3번 굴렸으면 무시
        if (player.currentTurn > 3) {
            return;
        }
        
        // 주사위 굴리기
        const diceResult = rollDice();
        
        // 플레이어 상태 업데이트
        player.totalScore += diceResult;
        player.diceHistory.push(diceResult);
        player.currentTurn++;
        
        console.log(`플레이어 ${player.name} 주사위: ${diceResult}, 총점: ${player.totalScore}`);
        
        // 모든 플레이어에게 결과 전송
        io.emit('dice_rolled', {
            playerId: socket.id,
            playerName: player.name,
            diceResult: diceResult,
            totalScore: player.totalScore,
            currentTurn: player.currentTurn
        });
        
        // 게임 종료 확인
        if (checkGameEnd()) {
            const result = determineWinner();
            io.emit('game_end', {
                players: gameState.players,
                result: result
            });
        } else {
            // 다음 턴으로
            nextTurn();
            io.emit('turn_change', {
                currentTurn: gameState.currentTurn,
                players: gameState.players
            });
        }
    });

    // 새 게임 시작
    socket.on('new_game', () => {
        // 게임 상태 초기화
        gameState.players = {};
        gameState.currentTurn = null;
        gameState.gameStatus = 'waiting';
        gameState.currentPlayerIndex = 0;
        gameState.playerOrder = [];
        
        io.emit('game_reset');
    });

    // 연결 해제
    socket.on('disconnect', () => {
        console.log('플레이어 연결 해제:', socket.id);
        
        // 플레이어 제거
        if (gameState.players[socket.id]) {
            delete gameState.players[socket.id];
            gameState.playerOrder = gameState.playerOrder.filter(id => id !== socket.id);
            
            // 게임 상태 업데이트
            if (gameState.playerOrder.length === 0) {
                gameState.gameStatus = 'waiting';
                gameState.currentTurn = null;
            }
            
            io.emit('player_disconnected', {
                playerId: socket.id,
                players: gameState.players,
                gameStatus: gameState.gameStatus
            });
        }
    });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
    console.log(`http://localhost:${PORT} 에서 게임을 확인하세요.`);
});
