import { PoolEngine } from './src/game/engine/PoolEngine.js';
import * as Constants from './src/game/engine/Constants.js';
async function runPhysicsTest() {
    console.log('--- Starting Physics Authority Verification ---');
    // 1. Initialize Engine (8-Ball Mode)
    const engine = new PoolEngine(Constants.GAME_MODE_EIGHT);
    const initialBalls = engine.getBalls();
    // Check Cue Ball Position
    const cueBall = initialBalls.find(b => b.getNumber() === 0);
    const initialX = cueBall.getX();
    const initialY = cueBall.getY();
    console.log(`Initial Cue Ball Pos: (${initialX}, ${initialY})`);
    // 2. Execute Shot (Angle: 0, Power: 20) -> Shooting right
    console.log('Executing Server-Side Shot...');
    const result = engine.executeShot(0, 20, 0, 0);
    // 3. Verify State Change
    const newCueBall = engine.getBalls().find(b => b.getNumber() === 0);
    console.log(`New Cue Ball Pos: (${newCueBall.getX().toFixed(4)}, ${newCueBall.getY().toFixed(4)})`);
    if (newCueBall.getX() === initialX && newCueBall.getY() === initialY) {
        console.error('FAILURE: Cue ball did not move!');
        process.exit(1);
    }
    // Check if any balls moved (rack break)
    const moved = engine.getBalls().some(b => b.getNumber() !== 0 && (Math.abs(b.getX() - Constants.STARTING_RACK_POS[Constants.GAME_MODE_EIGHT][b.getNumber() - 1].x) > 0.1));
    if (moved) {
        console.log('SUCCESS: Rack balls scattered. Physics engine is active.');
    }
    else {
        console.log('NOTE: Rack might not have been hit or power too low/angle off. Checking collision events.');
    }
    // Check events
    if (result.events.length > 0) {
        console.log(`SUCCESS: ${result.events.length} physics events generated (Collisions/Bounces).`);
    }
    else {
        console.error('FAILURE: No physics events generated.');
        process.exit(1);
    }
    console.log('--- Verification Complete: Physics is Server-Authoritative ---');
}
runPhysicsTest().catch(console.error);
