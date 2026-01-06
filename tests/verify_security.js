import { io } from "socket.io-client";

const socket1 = io("http://localhost:3000");
const socket2 = io("http://localhost:3000");

let gameId = null;

socket1.on("connect", () => {
    console.log("Player 1 connected");
    socket1.emit("find_match", { stake: 100, mode: "8ball" });
});

socket2.on("connect", () => {
    console.log("Player 2 connected");
    socket2.emit("find_match", { stake: 100, mode: "8ball" });
});

socket1.on("match_found", (data) => {
    console.log("Player 1 match found:", data);
    gameId = data.gameId;

    // Malicious Attempt
    setTimeout(() => {
        console.log("Attempting malicious WIN event...");
        socket1.emit("game_over", { winner: socket1.id }); // Server should ignore
        socket1.emit("update", { balls: [] }); // Server should ignore

        // Valid attempt (but mocked vector)
        /*
        console.log("Sending valid shot...");
        socket1.emit("shot", { angle: 0, power: 0.5 });
        */
    }, 1000);
});

socket2.on("game_over", (data) => {
    if (data.reason !== "8-ball potted" && data.reason !== "timeout") {
        console.error("SECURITY FAIL: Client received game_over from malicious event!", data);
    } else {
        console.log("Game over received (valid):", data);
    }
});

setTimeout(() => {
    console.log("Test finished. If no error above, security likely passed.");
    process.exit(0);
}, 5000);
