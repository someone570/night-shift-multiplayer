const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const rooms = new Map();

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function broadcast(room, data) {
    for (const player of room.players) {
        send(player, data);
    }
}

function createCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";

    do {
        code = "";

        for (let i = 0; i < 5; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));

    return code;
}

const server = http.createServer((req, res) => {
    let url = req.url.split("?")[0];

    if (url === "/") {
        url = "/index.html";
    }

    const filePath = path.join(__dirname, url);

    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            res.writeHead(404);
            res.end("File not found");
            return;
        }

        let type = "text/plain; charset=utf-8";

        if (filePath.endsWith(".html")) {
            type = "text/html; charset=utf-8";
        }

        if (filePath.endsWith(".js")) {
            type = "text/javascript; charset=utf-8";
        }

        res.writeHead(200, {
            "Content-Type": type
        });

        res.end(data);
    });
});

const wss = new WebSocket.Server({
    server: server
});

wss.on("connection", (ws) => {

    ws.room = null;
    ws.player = null;

    send(ws, {
        type: "connected"
    });

    ws.on("message", (raw) => {

        let message;

        try {
            message = JSON.parse(raw.toString());
        } catch {
            send(ws, {
                type: "error",
                message: "Неверный формат сообщения."
            });

            return;
        }

        if (message.type === "create") {

            const code = createCode();

            const room = {
                players: [],
                state: {
                    player1: {
                        x: 100,
                        y: 100
                    },
                    player2: {
                        x: 400,
                        y: 300
                    }
                }
            };

            rooms.set(code, room);

            ws.room = code;
            ws.player = 1;

            room.players.push(ws);

            send(ws, {
                type: "created",
                code: code,
                player: 1,
                state: room.state
            });

            return;
        }

        if (message.type === "join") {

            const code = String(message.code || "")
                .trim()
                .toUpperCase();

            const room = rooms.get(code);

            if (!room) {
                send(ws, {
                    type: "error",
                    message: "Комната не найдена."
                });

                return;
            }

            if (room.players.length >= 2) {
                send(ws, {
                    type: "error",
                    message: "Комната уже заполнена."
                });

                return;
            }

            ws.room = code;
            ws.player = 2;

            room.players.push(ws);

            send(ws, {
                type: "joined",
                code: code,
                player: 2,
                state: room.state
            });

            broadcast(room, {
                type: "start",
                state: room.state
            });

            return;
        }

        const room = rooms.get(ws.room);

        if (!room) {
            return;
        }

        if (message.type === "move") {

            const playerName =
                ws.player === 1
                    ? "player1"
                    : "player2";

            const x = Number(message.x);
            const y = Number(message.y);

            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return;
            }

            room.state[playerName].x = x;
            room.state[playerName].y = y;

            broadcast(room, {
                type: "state",
                state: room.state
            });

            return;
        }

        if (message.type === "action") {

            broadcast(room, {
                type: "action",
                player: ws.player,
                action: String(message.action || "")
            });

            return;
        }
    });

    ws.on("close", () => {

        const code = ws.room;

        if (!code) {
            return;
        }

        const room = rooms.get(code);

        if (!room) {
            return;
        }

        room.players =
            room.players.filter(
                player => player !== ws
            );

        broadcast(room, {
            type: "left"
        });

        if (room.players.length === 0) {
            rooms.delete(code);
        }
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("==============================");
    console.log(" NIGHT SHIFT MULTIPLAYER");
    console.log("==============================");
    console.log("Сервер запущен!");
    console.log("http://127.0.0.1:8080");
    console.log("==============================");
    console.log("");
});