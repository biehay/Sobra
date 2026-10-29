// Arranca Next (`npm run dev` o `npm start`) y, cuando la app ya responde, la
// abre en el navegador. No abre nada si la salida va a un archivo (por ejemplo
// en el recorrido de pruebas), en CI o con SOBRA_NO_ABRIR=1.
import { spawn } from "node:child_process";

const [modo, ...resto] = process.argv.slice(2);
const abrir = process.stdout.isTTY && !process.env.CI && process.env.SOBRA_NO_ABRIR !== "1";

const next = spawn("next", [modo, ...resto], {
  shell: true,
  stdio: ["inherit", "pipe", "inherit"],
  env: { ...process.env, FORCE_COLOR: process.stdout.isTTY ? "1" : process.env.FORCE_COLOR },
});

let abierto = false;
next.stdout.on("data", (parte) => {
  process.stdout.write(parte);
  if (!abrir || abierto) return;
  // Next avisa la dirección (si el 3000 está ocupado usa otro puerto).
  const url = parte.toString().replace(/\x1b\[[0-9;]*m/g, "").match(/https?:\/\/localhost:\d+/)?.[0];
  if (url) {
    abierto = true;
    abrirCuandoResponda(url);
  }
});
next.on("exit", (codigo) => process.exit(codigo ?? 0));

async function abrirCuandoResponda(url) {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(url);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const [comando, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(comando, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}
