'use strict';

const {handleRequest} = require('../lib/handler');

module.exports = async function handler(req,res) {
  try {
    await handleRequest(req,res);
  } catch (error) {
    console.error('Vercel request failed:',error.name);
    if (!res.headersSent) {
      res.writeHead(500,{
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':'no-store'
      });
    }
    res.end(JSON.stringify({error:'Internal server error'}));
  }
};
