'use strict';

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = parseInt(process.env.PORT || '3080', 10);
const TARGET_PHONE = process.argv[2] || process.env.PHONE_NUMBER || '5511968326792';

console.log(`📡 Disparando envio do APK para o WhatsApp (+${TARGET_PHONE})...`);

const postData = JSON.stringify({ phone: TARGET_PHONE });

const req = http.request(
  {
    hostname: 'localhost',
    port: PORT,
    path: '/send-apk',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 30000
  },
  (res) => {
    let raw = '';
    res.on('data', chunk => raw += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(raw);
        if (json.success) {
          console.log(`\n🎉 SUCESSO! ${json.message}`);
          if (json.details) {
            console.log(`📦 Arquivo: ${json.details.fileName} (${json.details.sizeMb})`);
          }
        } else {
          console.error(`\n❌ Falha no envio: ${json.error || raw}`);
        }
      } catch {
        console.log(`Resposta do servidor (${res.statusCode}):`, raw);
      }
    });
  }
);

req.on('error', (err) => {
  if (err.code === 'ECONNREFUSED') {
    console.error(`\n❌ O servidor Baileys não está rodando na porta ${PORT}!`);
    console.log(`💡 Para iniciar o serviço do Baileys, execute primeiro:`);
    console.log(`   cd "wa-updater" && npm start\n`);
  } else {
    console.error(`❌ Erro na requisição:`, err.message);
  }
});

req.write(postData);
req.end();
