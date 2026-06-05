const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const pdfs = {
  "1": "E:\\0 - Proyecto de Grado\\DOCUMENTO\\PLANCHAS\\7\\1.pdf",
  "2": "E:\\0 - Proyecto de Grado\\DOCUMENTO\\PLANCHAS\\7\\2.pdf",
  "3": "E:\\0 - Proyecto de Grado\\DOCUMENTO\\PLANCHAS\\7\\3.pdf",
  "4": "E:\\0 - Proyecto de Grado\\DOCUMENTO\\PLANCHAS\\7\\4.pdf"
};

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
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

function servePdf(request, response, id) {
  const filePath = pdfs[id];
  if (!filePath) return send404(response);
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) return send404(response);

    const headers = {
      "accept-ranges": "bytes",
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="plancha-${id}.pdf"`
    };
    if (request.method === "HEAD") {
      response.writeHead(200, { ...headers, "content-length": stat.size });
      response.end();
      return;
    }

    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        response.writeHead(416, { "content-range": `bytes */${stat.size}` });
        response.end();
        return;
      }
      let start;
      let end;
      if (match[1] === "") {
        const suffixLength = Number(match[2]);
        start = Math.max(stat.size - suffixLength, 0);
        end = stat.size - 1;
      } else {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : stat.size - 1;
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        response.writeHead(416, { "content-range": `bytes */${stat.size}` });
        response.end();
        return;
      }
      end = Math.min(end, stat.size - 1);
      response.writeHead(206, {
        ...headers,
        "content-range": `bytes ${start}-${end}/${stat.size}`,
        "content-length": end - start + 1
      });
      fs.createReadStream(filePath, { start, end }).pipe(response);
      return;
    }

    response.writeHead(200, { ...headers, "content-length": stat.size });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  const pdfMatch = /^\/pdf\/([1-4])$/.exec(url.pathname);
  if (pdfMatch) {
    servePdf(request, response, pdfMatch[1]);
    return;
  }
  serveStatic(request.url, response);
});

server.listen(port, () => {
  console.log(`Planchas local: http://localhost:${port}`);
});
