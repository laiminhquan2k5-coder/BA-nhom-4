const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const port = Number(process.env.PORT || 4173);
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/styles.css", ["styles.css", "text/css"]],
  ["/assets/logo2.png", ["assets/logo2.png", "image/png"]],
  ["/assets/soulwine-hero.jpg", ["assets/soulwine-hero.jpg", "image/jpeg"]],
  ["/sample-data.js", ["../soulwine-shared/sample-data.cjs", "text/javascript"]],
  ["/soulwine-shared/sample-data.cjs", ["../soulwine-shared/sample-data.cjs", "text/javascript"]],
  ...["data.js", "ui.js", "views.js", "workflows.js", "workspace.js", "management.js", "auth.js", "sample-loader.js", "app.js"].map((file) => [`/${file}`, [file, "text/javascript"]])
]);

const server = http.createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" });
    return response.end("Method not allowed");
  }
  const route = new URL(request.url, "http://localhost").pathname;
  if (route === "/favicon.ico") { response.writeHead(204); return response.end(); }
  const file = files.get(route);
  if (!file) { response.writeHead(404); return response.end("Not found"); }
  response.writeHead(200, { "Content-Type": `${file[1]}; charset=utf-8`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (request.method === "HEAD") return response.end();
  const stream = fs.createReadStream(path.join(__dirname, file[0]));
  stream.on("error", () => response.destroy());
  stream.pipe(response);
});

server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? `Port ${port} is in use. Set PORT to another value.` : error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => console.log(`SoulWine UI ready at http://localhost:${port}`));
