'use strict';

const http = require('node:http');
const {handleRequest} = require('./lib/handler');

const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(error => {
    console.error('Request failed:', error.name);
    if (!res.headersSent) {
      res.writeHead(500, {'Content-Type':'application/json; charset=utf-8'});
    }
    res.end(JSON.stringify({error:'Internal server error'}));
  });
});

server.listen(PORT, () => {
  console.log(`Contest site listening on port ${PORT}`);
});
