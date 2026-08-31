import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = normalize(pathname === "/" ? "index.html" : pathname.slice(1));
  const file = join(root, relative);
  if (!file.startsWith(root)) return response.writeHead(403).end("Forbidden");
  try {
    const stat = statSync(file);
    if (!stat.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Content-Length": stat.size });
    if (request.method === "HEAD") return response.end();
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(4173, "127.0.0.1", () => console.log("Mira Live: http://127.0.0.1:4173"));
