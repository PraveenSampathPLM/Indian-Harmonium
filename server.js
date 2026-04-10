import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = normalize(join(__filename, ".."));
const publicDir = join(__dirname, "public");
const pythonBinary = join(__dirname, ".venv", "bin", "python");
const sensorBridgeScript = join(__dirname, "sensor_bridge.py");
const port = process.env.PORT ? Number(process.env.PORT) : 4321;
const host = "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

const clients = new Set();
let lidState = {
  angle: null,
  isOpen: true,
  changedAt: Date.now(),
  source: "fallback-clamshell",
  sensorMode: "state",
  available: false,
  delta: 0
};

function readClamshellState() {
  return new Promise((resolve) => {
    execFile("ioreg", ["-r", "-k", "AppleClamshellState", "-d", "1"], { timeout: 1000 }, (error, stdout) => {
      if (error) {
        resolve({
          isOpen: lidState.isOpen,
          changedAt: lidState.changedAt,
          source: "fallback-clamshell",
          sensorMode: "state",
          available: false
        });
        return;
      }

      const match = stdout.match(/"AppleClamshellState"\s*=\s*(Yes|No)/i);
      if (!match) {
        resolve({
          isOpen: lidState.isOpen,
          changedAt: lidState.changedAt,
          source: "fallback-clamshell",
          sensorMode: "state",
          available: false
        });
        return;
      }

      const isOpen = match[1].toLowerCase() === "no";
      resolve({
        isOpen,
        changedAt: isOpen === lidState.isOpen ? lidState.changedAt : Date.now(),
        source: "ioreg",
        sensorMode: "state",
        available: true
      });
    });
  });
}

let bridgeState = {
  angle: null,
  available: false,
  source: "pybooklid",
  sensorMode: "angle"
};

function spawnSensorBridge() {
  const child = spawn(pythonBinary, [sensorBridgeScript], {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdoutBuffer = "";

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      try {
        const next = JSON.parse(line);
        bridgeState = {
          angle: typeof next.angle === "number" ? next.angle : null,
          available: Boolean(next.available),
          source: next.source || "pybooklid",
          sensorMode: next.sensorMode || "angle"
        };
      } catch (error) {
        console.error("Failed to parse sensor bridge output:", error);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    console.error(chunk.toString().trim());
  });

  child.on("close", () => {
    setTimeout(spawnSensorBridge, 1000);
  });
}

spawnSensorBridge();

function broadcast(state) {
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

setInterval(async () => {
  const clamshellState = await readClamshellState();
  const angle = bridgeState.available ? bridgeState.angle : null;
  const isOpen = typeof angle === "number" ? angle > 8 : clamshellState.isOpen;
  const delta = typeof angle === "number" && typeof lidState.angle === "number" ? angle - lidState.angle : 0;
  const changedAt =
    isOpen !== lidState.isOpen || Math.abs(delta) >= 3 ? Date.now() : lidState.changedAt;

  const nextState = {
    angle,
    isOpen,
    changedAt,
    source: angle !== null ? bridgeState.source : clamshellState.source,
    sensorMode: angle !== null ? "angle" : clamshellState.sensorMode,
    available: angle !== null ? true : clamshellState.available,
    delta
  };

  const changed = nextState.isOpen !== lidState.isOpen || Math.abs(delta) >= 3;
  lidState = nextState;
  if (changed) {
    broadcast({ ...lidState, pulse: true });
    return;
  }
  broadcast({ ...lidState, pulse: false });
}, 150);

async function serveFile(requestPath, response) {
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const targetPath = normalize(join(publicDir, cleanPath));
  if (!targetPath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(targetPath);
    const type = mimeTypes[extname(targetPath)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": type });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/lid") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(JSON.stringify(lidState));
    return;
  }

  if (url.pathname === "/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive"
    });
    response.write(`data: ${JSON.stringify({ ...lidState, pulse: false })}\n\n`);
    clients.add(response);
    request.on("close", () => {
      clients.delete(response);
    });
    return;
  }

  await serveFile(url.pathname, response);
});

server.listen(port, host, () => {
  console.log(`Indian Harmonium running on http://${host}:${port}`);
});
