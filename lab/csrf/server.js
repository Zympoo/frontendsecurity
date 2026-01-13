// server.js - minimal CSRF demo server (no frameworks)
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const crypto = require("crypto");
function readFile(p) {
    return fs.readFileSync(path.join(__dirname, "public", p), "utf8");
}
function parseCookies(cookieHeader = "") {
    const out = {};
    81
    cookieHeader.split(";").forEach(part => {
        const [k, ...v] = part.trim().split("=");
        if (!k) return;
        out[k] = decodeURIComponent(v.join("=") || "");
    });
    return out;
}
function send(res, status, body, headers = {}) {
    res.writeHead(status, { "Content-Type": "text/html; charset=utf8", ...headers });
    res.end(body);
}
function sendJson(res, status, obj, headers = {}) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf8", ...headers });
    res.end(JSON.stringify(obj, null, 2));
}
function readBody(req) {
    return new Promise(resolve => {
        let data = "";
        req.on("data", chunk => (data += chunk));
        req.on("end", () => resolve(data));
    });
}
function parseForm(body) {
    const params = new URLSearchParams(body);
    const out = {};
    for (const [k, v] of params.entries()) out[k] = v;
    return out;
}
// In-memory “database”
const sessions = new Map(); // sid -> { user, balance, csrfToken, log: [] }
function getSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.sid;
    if (!sid) return null;
    return sessions.get(sid) || null;
}
function newSession() {
    const sid = crypto.randomBytes(16).toString("hex");
    const csrfToken = crypto.randomBytes(16).toString("hex");
    sessions.set(sid, {
        user: "tom",
        balance: 10000,
        csrfToken,
        log: [{ type: "INIT", msg: "Account geopend", ts: Date.now() }],
    });
    return sid;
}
// BANK server (8080)
const bankServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost:8080");
    const method = req.method;
    // static pages
    if (url.pathname === "/" || url.pathname === "/bank.html") {
        return send(res, 200, readFile("bank.html"));
    }
    if (url.pathname === "/login" && method === "POST") {
        // Maak sessie + cookie
        const sid = newSession();
        // Zet cookie (SameSite is expres zwak voor de demo)
        // Let op: SameSite=None vereist Secure, daarom gebruiken we hier geen None.
        // We gebruiken SameSite=Lax zodat POST CSRF nog kan via top-level
        // navigation ? In praktijk: Lax blokkeert vaak POST from third - party contexts.
        // Voor de demo zetten we SameSite=Strict later als fix.
        return sendJson(
            res,
            200,
            { ok: true, message: "Logged in", sid },
            { "Set-Cookie": `sid=${sid}; Path=/` }
        );
    }
    if (url.pathname === "/me" && method === "GET") {
        const s = getSession(req);
        if (!s) return sendJson(res, 401, { ok: false, error: "Not logged in" });
        return sendJson(res, 200, {
            ok: true, user: s.user, balance: s.balance,
            log: s.log
        });
    }
    // Vulnerable transfer endpoint: geen CSRF token check
    if (url.pathname === "/transfer" && method === "POST") {
        const s = getSession(req);
        if (!s) return sendJson(res, 401, { ok: false, error: "Not logged in" });
        const body = await readBody(req);
        const form = parseForm(body);
        const to = (form.to || "").trim();
        const amount = Number(form.amount || 0);
        if (!to || !Number.isFinite(amount) || amount <= 0) {
            return sendJson(res, 400, { ok: false, error: "Invalid transfer" });
        }
        s.balance -= amount;
        s.log.push({
            type: "TRANSFER", msg: `€${amount} naar ${to}`, ts:
                Date.now()
        });
        return sendJson(res, 200, { ok: true, balance: s.balance });
    }
    // CSRF-protected transfer endpoint (fix variant)
    if (url.pathname === "/transfer-protected" && method === "POST") {
        const s = getSession(req);
        if (!s) return sendJson(res, 401, { ok: false, error: "Not logged in" });
        const body = await readBody(req);
        const form = parseForm(body);
        const token = form.csrf || "";
        if (token !== s.csrfToken) {
            s.log.push({
                type: "BLOCK", msg: "CSRF geblokkeerd: fout token", ts:
                    Date.now()
            });
            return sendJson(res, 403, { ok: false, error: "CSRF blocked" });
        }
        const to = (form.to || "").trim();
        const amount = Number(form.amount || 0);
        if (!to || !Number.isFinite(amount) || amount <= 0) {
            return sendJson(res, 400, { ok: false, error: "Invalid transfer" });
        }
        s.balance -= amount;
        s.log.push({
            type: "TRANSFER", msg: `€${amount} naar ${to}`, ts:
                Date.now()
        });
        return sendJson(res, 200, { ok: true, balance: s.balance });
    }
    if (url.pathname === "/csrf-token" && method === "GET") {
        const s = getSession(req);
        if (!s) return sendJson(res, 401, { ok: false, error: "Not logged in" });
        return sendJson(res, 200, { ok: true, csrfToken: s.csrfToken });
    }
    return send(res, 404, "<h1>404</h1>");
});
// EVIL server (8081)
const evilServer = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost:8081");
    if (url.pathname === "/" || url.pathname === "/evil.html") {
        return send(res, 200, readFile("evil.html"));
    }
    return send(res, 404, "<h1>404</h1>");
});
bankServer.listen(8080, () => console.log("BANK on http://localhost:8080"));
evilServer.listen(8081, () => console.log("EVIL on http://localhost:8081"));