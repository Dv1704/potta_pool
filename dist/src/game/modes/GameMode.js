import { PoolEngine } from '../engine/PoolEngine';
export class GameMode {
    engine;
    players; // [player1Id, player2Id]
    currentTurnIndex = 0;
    isGameOver = false;
    winner = null;
    constructor(players, mode) {
        this.players = players;
        this.engine = new PoolEngine(mode);
    }
    getPlayers() {
        return this.players;
    }
    isFinished() {
        return this.isGameOver;
    }
    getWinner() {
        return this.winner;
    }
}
