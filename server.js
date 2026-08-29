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

```
let code = "";

do {
    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
} while (rooms.has(code));

return code;
```

}

function newGameState() {
return {
gameStarted: false,
gameOver: false,
winner: null,

```
    message: "Ожидание второго игрока...",

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

const server = http.createServer((req, res) => {

```
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

fs.readFile(filePath, (err, data) => {

    if (err) {
        res.writeHead(404);
        res.end("File not found");
        return;
    }

    let contentType =
        "text/plain; charset=utf-8";

    if (filePath.endsWith(".html")) {
        contentType =
            "text/html; charset=utf-8";
    }

    if (filePath.endsWith(".js")) {
        contentType =
            "text/javascript; charset=utf-8";
    }

    if (filePath.endsWith(".css")) {
        contentType =
            "text/css; charset=utf-8";
    }

    res.writeHead(200, {
        "Content-Type": contentType
    });

    res.end(data);
});
```

});

const wss = new WebSocket.Server({
server: server
});

wss.on("connection", (ws) => {

```
console.log("WebSocket player connected");

ws.room = null;
ws.player = null;


send(ws, {
    type: "connected"
});


ws.on("message", (raw) => {

    let message;

    try {
        message =
            JSON.parse(raw.toString());
    } catch (error) {

        send(ws, {
            type: "error",
            message: "Неверный формат сообщения."
        });

        return;
    }


    /*
     * СОЗДАНИЕ КОМНАТЫ
     */

    if (message.type === "create") {

        const code = createCode();

        const room = {
            players: [],
            state: newGameState()
        };

        rooms.set(code, room);

        ws.room = code;
        ws.player = 1;

        room.players.push({
            ws: ws,
            player: 1
        });


        send(ws, {
            type: "created",
            code: code,
            player: 1,
            state: room.state
        });

        console.log(
            "Room created:",
            code
        );

        return;
    }


    /*
     * ПОДКЛЮЧЕНИЕ
     */

    if (message.type === "join") {

        const code =
            String(message.code || "")
                .trim()
                .toUpperCase();

        const room =
            rooms.get(code);

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
            ws: ws,
            player: 2
        });


        room.state.gameStarted = true;
        room.state.message =
            "Игра началась!";


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


        console.log(
            "Player 2 joined room:",
            code
        );

        return;
    }


    /*
     * ПОИСК КОМНАТЫ
     */

    const room =
        rooms.get(ws.room);

    if (!room) {
        return;
    }


    /*
     * ============================
     * ОХРАННИК
     * ============================
     */

    if (
        ws.player === 1 &&
        message.type === "guardAction"
    ) {

        if (room.state.gameOver) {
            return;
        }


        const action =
            String(message.action || "");


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
            state: room.state
        });

        return;
    }


    /*
     * ============================
     * АНИМАТРОНИК
     * ============================
     */

    if (
        ws.player === 2 &&
        message.type === "animatronicMove"
    ) {

        if (room.state.gameOver) {
            return;
        }


        /*
         * ВАЖНО:
         * Получаем location из кнопки.
         */

        const location =
            String(message.location || "")
                .trim();


        const allowedLocations = [
            "stage",
            "dining",
            "leftHall",
            "rightHall",
            "leftDoor",
            "rightDoor"
        ];


        /*
         * Проверяем, что локация существует.
         */

        if (
            !allowedLocations.includes(
                location
            )
        ) {

            send(ws, {
                type: "error",
                message:
                    "Неизвестная локация: " +
                    location
            });

            return;
        }


        /*
         * ЗДЕСЬ ПРОИСХОДИТ ДВИЖЕНИЕ.
         */

        room.state.animatronic.location =
            location;


        /*
         * Если аниматроник
         * находится у двери,
         * запоминаем сторону.
         */

        if (location === "leftDoor") {

            room.state.animatronic.target =
                "left";

            room.state.message =
                "Аниматроник у левой двери!";
        }

        else if (
            location === "rightDoor"
        ) {

            room.state.animatronic.target =
                "right";

            room.state.message =
                "Аниматроник у правой двери!";
        }

        else {

            room.state.animatronic.target =
                null;

            room.state.message =
                "Аниматроник переместился в " +
                location;
        }


        /*
         * ОТПРАВЛЯЕМ НОВОЕ СОСТОЯНИЕ
         * ОБОИМ ИГРОКАМ.
         */

        broadcast(room, {
            type: "state",
            state: room.state
        });


        console.log(
            "Animatronic moved:",
            codeSafe(room),
            location
        );


        return;
    }


    /*
     * ============================
     * АТАКА
     * ============================
     */

    if (
        ws.player === 2 &&
        message.type === "attack"
    ) {

        if (room.state.gameOver) {
            return;
        }


        const target =
            room.state.animatronic.target;


        if (!target) {

            send(ws, {
                type: "error",
                message:
                    "Сначала подойди к двери."
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
                state: room.state
            });

            return;
        }


        room.state.gameOver = true;
        room.state.winner =
            "animatronic";

        room.state.message =
            "Аниматроник пробрался в офис!";


        broadcast(room, {
            type: "gameOver",
            winner: "animatronic",
            state: room.state
        });


        return;
    }
});


ws.on("close", () => {

    const code = ws.room;

    if (!code) {
        return;
    }

    const room =
        rooms.get(code);

    if (!room) {
        return;
    }


    room.players =
        room.players.filter(
            player =>
                player.ws !== ws
        );


    if (room.players.length > 0) {

        broadcast(room, {
            type: "playerLeft"
        });
    }


    if (room.players.length === 0) {

        rooms.delete(code);

        console.log(
            "Room deleted:",
            code
        );
    }
});
```

});

function codeSafe(room) {

```
for (const [code, value] of rooms) {

    if (value === room) {
        return code;
    }
}

return "unknown";
```

}

server.listen(
PORT,
"0.0.0.0",
() => {

```
    console.log("");
    console.log(
        "=============================="
    );
    console.log(
        " NIGHT SHIFT MULTIPLAYER"
    );
    console.log(
        "=============================="
    );
    console.log(
        "Server started"
    );
    console.log(
        "PORT:",
        PORT
    );
    console.log(
        "=============================="
    );
    console.log("");
}
```

);
