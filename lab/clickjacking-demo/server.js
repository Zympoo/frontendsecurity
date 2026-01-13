const http = require("http");
const fs = require("fs");
const path = require("path");
function contentTypeFor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".html") return "text/html; charset=utf-8";
    if (ext === ".js") return "text/javascript; charset=utf-8";
    if (ext === ".css") return "text/css; charset=utf-8";
    return "text/plain; charset=utf-8";
}
function serveStatic(rootDir, req, res) {
    const urlPath = req.url.split("?")[0];
    const filePath = urlPath === "/" ? "/index.html" : urlPath;
    const fullPath = path.join(rootDir, filePath);
    if (!fullPath.startsWith(rootDir)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Forbidden");
    }
    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": contentTypeFor(fullPath) });
        res.end(data);
    });
}
const bankRoot = path.join(__dirname, "bank");
const evilRoot = path.join(__dirname, "evil");
http.createServer((req, res) => serveStatic(bankRoot, req, res))
    .listen(8080, () => console.log("BANK http://localhost:8080"));
http.createServer((req, res) => serveStatic(evilRoot, req, res))
    .listen(8081, () => console.log("EVIL http://localhost:8081"));