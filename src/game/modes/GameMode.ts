import { PoolEngine, ShotResult } from '../engine/PoolEngine';

export interface GameState {
    balls: { [key: number]: { x: number; y: number; onTable: boolean } };
    turn: string; // userId of the player whose turn it is
    isGameOver: boolean;
    winner: string | null;
    timer?: number;
}

export abstract class GameMode {
    protected engine: PoolEngine;
    protected players: string[]; // [player1Id, player2Id]
    protected currentTurnIndex: number = 0;
    protected isGameOver: boolean = false;
    protected winner: string | null = null;

    constructor(players: string[], mode: number) {
        this.players = players;
        this.engine = new PoolEngine(mode);
    }

    abstract handleShot(playerId: string, angle: number, power: number, sideSpin: number, backSpin: number): ShotResult;
    abstract updateStatus(): void;
    abstract getGameState(): GameState;

    public getPlayers(): string[] {
        return this.players;
    }

    public isFinished(): boolean {
        return this.isGameOver;
    }

    public getWinner(): string | null {
        return this.winner;
    }
}
