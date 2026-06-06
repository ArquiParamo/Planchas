const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".pdf", "application/pdf"],
  [".svg", "image/svg+xml"]
]);

function send404(response) {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function serveStatic(requestUrl, response) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://localhost:${port}`).pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root)) return send404(response);
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return send404(response);
    response.writeHead(200, {
      "content-type": mime.get(path.extname(filePath)) || "application/octet-stream",
      "content-length": stat.size
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  const pdfMatch = /^\/pdf\/([1-4])$/.exec(url.pathname);
  if (pdfMatch) {
    send404(response);
    return;
  }
  serveStatic(request.url, response);
});

server.listen(port, () => {
  console.log(`Planchas local: http://localhost:${port}`);
});
