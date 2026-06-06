const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const releaseBase = "https://github.com/ArquiParamo/Planchas/releases/download/original-pdfs";
const pdfs = {
  "1": "1.pdf",
  "2": "2.pdf",
  "3": "3.pdf",
  "4": "4.pdf"
};

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
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

function pipePdfFromUrl(request, response, upstreamUrl, download = false, redirectsLeft = 4) {
  const headers = { "accept-encoding": "identity" };
  if (request.headers.range) headers.Range = request.headers.range;
  const upstreamRequest = https.request(upstreamUrl, { method: request.method, headers }, (upstream) => {
    const location = upstream.headers.location;
    if (
      location &&
      upstream.statusCode >= 300 &&
      upstream.statusCode < 400 &&
      redirectsLeft > 0
    ) {
      upstream.resume();
      pipePdfFromUrl(request, response, new URL(location, upstreamUrl).toString(), download, redirectsLeft - 1);
      return;
    }
    const nextHeaders = {
      ...upstream.headers,
      "content-type": "application/pdf",
      "content-disposition": download ? "attachment" : "inline"
    };
    response.writeHead(upstream.statusCode || 502, nextHeaders);
    if (request.method === "HEAD") {
      response.end();
      upstream.resume();
      return;
    }
    upstream.pipe(response);
  });
  upstreamRequest.on("error", () => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end("No se pudo cargar el PDF remoto.");
  });
  upstreamRequest.end();
}

function servePdf(request, response, id, download = false) {
  const fileName = pdfs[id];
  if (!fileName) return send404(response);
  const upstreamUrl = `${releaseBase}/${fileName}`;
  pipePdfFromUrl(request, response, upstreamUrl, download);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  const pdfMatch = /^\/pdf\/([1-4])$/.exec(url.pathname);
  if (pdfMatch) {
    servePdf(request, response, pdfMatch[1], url.searchParams.get("download") === "1");
    return;
  }
  serveStatic(request.url, response);
});

server.listen(port, () => {
  console.log(`Planchas local: http://localhost:${port}`);
});
