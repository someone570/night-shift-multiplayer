const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const rooms = new Map();

function send(ws, data) {
if (ws && ws.readyState === WebSocket.OPEN) {
ws.send(JSON.stringify(data));
}
}

function broadcast(room, data) {
for (const player of room.players) {
send(player.ws, data);
}
}

function createCode() {
const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
let code;

```
do {
    code = "";

    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
} while (rooms.has(code));

return code;
```

}

function createState() {
return {
gameStarted: false,
gameOver: false,
winner: null,
message: "Ожидание второго игрока...",

```
    power: 100,

    guard: {
        leftDoor: false,
        rightDoor: false,
        leftLight: false,
        rightLight: false
    },

    animatronic: {
        location: "stage",
        target: null
    }
};
```

}

function getPublicState(room) {
return room.state;
}

const server = http.createServer((req, res) => {
let url = req.url.split("?")[0];

```
if (url === "/") {
    url = "/index.html";
}

const safePath = path.normalize(url).replace(/^(\.\.[/\\])+/, "");
const filePath = path.join(__dirname, safePath);

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
    } else if (filePath.endsWith(".js")) {
        type = "text/javascript; charset=utf-8";
    } else if (filePath.endsWith(".css")) {
        type = "text/css; charset=utf-8";
    }

    res.writeHead(200, {
        "Content-Type": type
    });

    res.end(data);
});
```

});

const wss = new WebSocket.Server({
server
});

wss.on("connection", (ws) => {
ws.room = null;
ws.player = null;

```
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
            message: "Неверное сообщение."
        });
        return;
    }

    // СОЗДАНИЕ КОМНАТЫ
    if (message.type === "create") {
        if (ws.room) {
            return;
        }

        const code = createCode();

        const room = {
            players: [],
            state: createState()
        };

        rooms.set(code, room);

        ws.room = code;
        ws.player = 1;

        room.players.push({
            ws,
            player: 1
        });

        send(ws, {
            type: "created",
            code,
            player: 1,
            state: getPublicState(room)
        });

        return;
    }

    // ПОДКЛЮЧЕНИЕ К КОМНАТЕ
    if (message.type === "join") {
        if (ws.room) {
            return;
        }

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

        room.players.push({
            ws,
            player: 2
        });

        room.state.gameStarted = true;
        room.state.message = "Игра началась!";

        send(ws, {
            type: "joined",
            code,
            player: 2,
            state: getPublicState(room)
        });

        broadcast(room, {
            type: "start",
            state: getPublicState(room)
        });

        return;
    }

    const room = rooms.get(ws.room);

    if (!room || !ws.player) {
        return;
    }

    // ИГРОК-ОХРАННИК
    if (ws.player === 1) {
        if (message.type === "guardAction") {
            if (room.state.gameOver) {
                return;
            }

            const action = String(message.action || "");

            if (action === "leftDoor") {
                room.state.guard.leftDoor =
                    !room.state.guard.leftDoor;

                room.state.message =
                    room.state.guard.leftDoor
                        ? "Левая дверь закрыта."
                        : "Левая дверь открыта.";
            }

            if (action === "rightDoor") {
                room.state.guard.rightDoor =
                    !room.state.guard.rightDoor;

                room.state.message =
                    room.state.guard.rightDoor
                        ? "Правая дверь закрыта."
                        : "Правая дверь открыта.";
            }

            if (action === "leftLight") {
                room.state.guard.leftLight =
                    !room.state.guard.leftLight;
            }

            if (action === "rightLight") {
                room.state.guard.rightLight =
                    !room.state.guard.rightLight;
            }

            broadcast(room, {
                type: "state",
                state: getPublicState(room)
            });

            return;
        }
    }

    // ИГРОК-АНИМАТРОНИК
    if (ws.player === 2) {
        if (message.type === "animatronicMove") {
            if (room.state.gameOver) {
                return;
            }

            const locations = [
                "stage",
                "dining",
                "leftHall",
                "rightHall",
                "leftDoor",
                "rightDoor"
            ];

            const location = String(message.location || "");

            if (!locations.includes(location)) {
                return;
            }

            room.state.animatronic.location = location;

            if (location === "leftDoor") {
                room.state.animatronic.target = "left";
                room.state.message =
                    "Аниматроник у левой двери!";
            } else if (location === "rightDoor") {
                room.state.animatronic.target = "right";
                room.state.message =
                    "Аниматроник у правой двери!";
            } else {
                room.state.animatronic.target = null;
                room.state.message =
                    "Аниматроник переместился.";
            }

            broadcast(room, {
                type: "state",
                state: getPublicState(room)
            });

            return;
        }

        if (message.type === "attack") {
            if (room.state.gameOver) {
                return;
            }

            const target =
                room.state.animatronic.target;

            if (!target) {
                send(ws, {
                    type: "error",
                    message: "Ты не находишься у двери."
                });
                return;
            }

            const doorClosed =
                target === "left"
                    ? room.state.guard.leftDoor
                    : room.state.guard.rightDoor;

            if (doorClosed) {
                room.state.message =
                    target === "left"
                        ? "Атака отбита! Левая дверь закрыта."
                        : "Атака отбита! Правая дверь закрыта.";

                broadcast(room, {
                    type: "attackBlocked",
                    state: getPublicState(room)
                });

                return;
            }

            room.state.gameOver = true;
            room.state.winner = "animatronic";
            room.state.message =
                "Аниматроник пробрался в офис!";

            broadcast(room, {
                type: "gameOver",
                winner: "animatronic",
                state: getPublicState(room)
            });

            return;
        }
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
            player => player.ws !== ws
        );

    if (room.players.length > 0) {
        broadcast(room, {
            type: "playerLeft"
        });
    }

    if (room.players.length === 0) {
        rooms.delete(code);
    }
});
```

});

server.listen(PORT, "0.0.0.0", () => {
console.log("");
console.log("==============================");
console.log(" NIGHT SHIFT MULTIPLAYER");
console.log("==============================");
console.log("Сервер запущен!");
console.log("PORT:", PORT);
console.log("==============================");
console.log("");
});
