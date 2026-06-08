import { TurnMode } from './src/game/modes/TurnMode.js';

async function testWin() {
    const turnMode = new TurnMode(['player1', 'player2']);
    turnMode.startGame();

    const balls = turnMode.getBalls();
    for (let i = 1; i <= 7; i++) {
        balls[i].setFlagOnTable(false);
    }
    
    (turnMode as any).playerGroups['player1'] = 'solids';
    (turnMode as any).playerGroups['player2'] = 'stripes';
    (turnMode as any).groupAssigned = true;
    (turnMode as any).isBreakShot = false;

    // Place the 8-ball at pocket 0
    balls[8].setPos(95, 85);

    console.log('8-ball onTable before shot:', balls[8].isBallOnTable());
    console.log('8-ball getHole before shot:', balls[8].getHole());

    const result = turnMode.handleShot('player1', 0, 10, 0, 0);

    console.log('8-ball onTable after shot:', balls[8].isBallOnTable());
    console.log('8-ball getHole after shot:', balls[8].getHole() ? 'Vector2(' + balls[8].getHole().x + ',' + balls[8].getHole().y + ')' : 'null');
    console.log('pocketedBalls:', result.pocketedBalls);
}

testWin().catch(console.error);
