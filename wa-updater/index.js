'use strict';

const path = require('path');
const fs = require('fs');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const cors = require('cors');

// --- Configurações ---
const DEFAULT_PHONE = (process.env.PHONE_NUMBER || '5511968326792').replace(/\D/g, '');
const PORT = parseInt(process.env.PORT || '3080', 10);
const GITHUB_REPO = process.env.GITHUB_REPO || 'leeeopr/chacara-inventario';
const AUTH_DIR = path.join(__dirname, 'auth_info');
const TEMP_DIR = path.join(__dirname, 'temp');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

let sock = null;
let isConnected = false;
let isPairingRequested = false;

// --- Helper: Baixar arquivo via HTTPS ---
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = (targetUrl) => {
      https.get(targetUrl, { headers: { 'User-Agent': 'Node-Baileys-Updater' } }, (response) => {
        // Redirecionamento (GitHub Releases redireciona para AWS S3)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          return request(response.headers.location);
        }
        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          return reject(new Error(`Falha ao baixar arquivo HTTP ${response.statusCode}`));
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve(destPath));
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    };
    request(url);
  });
}

// --- Helper: Localizar ou baixar o APK mais recente ---
async function resolveApkFile() {
  const localApkPath = path.resolve(__dirname, '../Chacara-Inventario.apk');
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  
  let currentVersion = '1.0.23';
  try {
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (pkg.version) currentVersion = pkg.version;
    }
  } catch (err) {
    console.warn('Não foi possível ler package.json:', err.message);
  }

  // 1. Verificar se APK local compilado existe
  if (fs.existsSync(localApkPath)) {
    const stats = fs.statSync(localApkPath);
    if (stats.size > 1000000) { // Maior que 1MB
      console.log(`📦 Usando APK local compilado: ${localApkPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
      return {
        filePath: localApkPath,
        fileName: `Chacara-Inventario-v${currentVersion}.apk`,
        version: currentVersion,
        source: 'local'
      };
    }
  }

  // 2. Se não existir local ou for inválido, buscar releases no GitHub
  console.log(`🌐 Buscando releases no GitHub (${GITHUB_REPO})...`);
  const releaseApiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=10`;
  
  const releasesList = await new Promise((resolve, reject) => {
    https.get(releaseApiUrl, { headers: { 'User-Agent': 'Node-Baileys-Updater', 'Accept': 'application/vnd.github.v3+json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`GitHub API retornou status ${res.statusCode}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });

  // Encontrar a release mais recente que contenha um anexo .apk
  let targetRelease = null;
  let apkAsset = null;

  const list = Array.isArray(releasesList) ? releasesList : [releasesList];
  for (const rel of list) {
    const asset = rel.assets?.find(a => a.name?.toLowerCase().endsWith('.apk'));
    if (asset && asset.browser_download_url) {
      targetRelease = rel;
      apkAsset = asset;
      break;
    }
  }

  if (!apkAsset || !targetRelease) {
    throw new Error('Nenhum arquivo .apk encontrado nas releases do GitHub.');
  }

  const releaseVersion = (targetRelease.tag_name || currentVersion).replace(/^v/, '');
  const downloadedApkPath = path.join(TEMP_DIR, `Chacara-Inventario-v${releaseVersion}.apk`);

  // Se já baixou essa versão no temp, reutilizar
  if (fs.existsSync(downloadedApkPath)) {
    return {
      filePath: downloadedApkPath,
      fileName: `Chacara-Inventario-v${releaseVersion}.apk`,
      version: releaseVersion,
      source: 'github-cached'
    };
  }

  console.log(`⬇️ Baixando APK do GitHub (${targetRelease.tag_name}: ${apkAsset.browser_download_url})...`);
  await downloadFile(apkAsset.browser_download_url, downloadedApkPath);
  console.log(`✅ Download concluído: ${downloadedApkPath}`);

  return {
    filePath: downloadedApkPath,
    fileName: `Chacara-Inventario-v${releaseVersion}.apk`,
    version: releaseVersion,
    source: 'github'
  };
}

// --- Função: Enviar APK via WhatsApp ---
async function sendApk(targetPhone = DEFAULT_PHONE) {
  if (!sock || !isConnected) {
    throw new Error('WhatsApp não está conectado no momento. Inicie o Baileys e complete o pareamento.');
  }

  const cleanPhone = targetPhone.replace(/\D/g, '');
  if (!cleanPhone) {
    throw new Error('Número de telefone inválido.');
  }
  const jid = `${cleanPhone}@s.whatsapp.net`;

  console.log(`🚀 Iniciando envio do APK para ${cleanPhone}...`);

  // 1. Mensagem de aviso inicial
  await sock.sendMessage(jid, {
    text: `⏳ *Chácara Inventário — Atualização*\n\nLocalizando o pacote APK mais recente para envio... Aguarde alguns instantes!`
  });

  // 2. Obter arquivo APK
  const apkInfo = await resolveApkFile();
  const fileBuffer = fs.readFileSync(apkInfo.filePath);
  const sizeMb = (fileBuffer.length / 1024 / 1024).toFixed(1);

  // 3. Enviar APK como documento executável do Android
  const caption = 
    `📲 *Chácara Inventário — Versão v${apkInfo.version}*\n\n` +
    `✨ *Novidade: Agenda 100% Unificada (Chácara & Serviços Particulares)*\n` +
    `• Zero separação de agendas: tarefas da chácara e serviços do dia a dia no mesmo calendário!\n` +
    `• Faxineira e Piscineiro podem criar seus serviços particulares com data, horários, cliente e valor (R$)\n` +
    `• Ações rápidas de contato: WhatsApp com mensagem pronta, Como Chegar (Google Maps) e Ligar direto\n` +
    `• Visual sênior intuitivo: botões grandes, contraste nítido e badges coloridas por categoria\n\n` +
    `📦 Arquivo: \`${apkInfo.fileName}\` (${sizeMb} MB)\n\n` +
    `👉 Toque no arquivo acima para instalar a nova versão!\n\n` +
    `_Enviado automaticamente pelo Baileys Updater._`;

  await sock.sendMessage(jid, {
    document: fileBuffer,
    mimetype: 'application/vnd.android.package-archive',
    fileName: apkInfo.fileName,
    caption: caption
  });

  console.log(`✅ APK ${apkInfo.fileName} enviado com sucesso para ${cleanPhone}!`);
  return {
    success: true,
    recipient: cleanPhone,
    fileName: apkInfo.fileName,
    version: apkInfo.version,
    sizeMb: `${sizeMb} MB`
  };
}

// --- Inicialização do Baileys ---
async function connectToWhatsApp() {
  console.log('🔄 Inicializando conexão com o WhatsApp...');
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`📱 Usando Baileys v${version.join('.')} (última versão: ${isLatest})`);

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false, // Usaremos código de pareamento!
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    syncFullHistory: false
  });

  // Salvar credenciais automaticamente quando atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Se não estiver registrado, solicitar Pairing Code
  if (!sock.authState.creds.registered && !isPairingRequested) {
    isPairingRequested = true;
    setTimeout(async () => {
      try {
        console.log(`\n⏳ Solicitando Código de Pareamento para o número +${DEFAULT_PHONE}...`);
        const pairingCode = await sock.requestPairingCode(DEFAULT_PHONE);
        const formattedCode = `${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}`;
        
        console.log('\n' + '═'.repeat(54));
        console.log('📲 CÓDIGO DE PAREAMENTO DO WHATSAPP GERADO COM SUCESSO:');
        console.log(`👉  \x1b[1m\x1b[32m${formattedCode}\x1b[0m  👈`);
        console.log('═'.repeat(54));
        console.log('Passo a passo no seu celular:');
        console.log('1. Abra o WhatsApp no aparelho com o número +' + DEFAULT_PHONE);
        console.log('2. Vá em Configurações > Aparelhos Conectados');
        console.log('3. Toque em "Conectar um aparelho"');
        console.log('4. Na parte inferior, toque em "Conectar com número de telefone"');
        console.log(`5. Digite o código de 8 dígitos acima: ${formattedCode}`);
        console.log('═'.repeat(54) + '\n');
      } catch (err) {
        console.error('❌ Erro ao solicitar Pairing Code:', err?.message || err);
        isPairingRequested = false;
      }
    }, 4000);
  }

  // Monitorar estado da conexão
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      isConnected = true;
      isPairingRequested = false;
      const userJid = sock.user?.id || 'Desconhecido';
      console.log('\n' + '═'.repeat(54));
      console.log(`🎉 WHATSAPP CONECTADO COM SUCESSO!`);
      console.log(`👤 Usuário logado: ${userJid}`);
      console.log(`🎯 Destinatário padrão para APK: +${DEFAULT_PHONE}`);
      console.log('═'.repeat(54) + '\n');
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ Conexão encerrada (Status: ${statusCode}). Reconectando: ${shouldReconnect}`);

      if (shouldReconnect) {
        await delay(3000);
        connectToWhatsApp();
      } else {
        console.log('❌ Sessão desconectada/expirada. Remova a pasta auth_info e reinicie para novo pareamento.');
      }
    }
  });

  // Ouvir mensagens recebidas (se o usuário mandar "apk", "atualizar", etc)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      const fromJid = msg.key.remoteJid;
      if (!fromJid || fromJid.endsWith('@g.us')) continue; // Ignorar grupos por segurança

      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      ).trim().toLowerCase();

      // Comandos que disparam o envio
      const triggers = ['apk', 'atualizar', 'update', '#apk', '/apk', 'baixar apk'];
      const matches = triggers.some(t => text === t || text.startsWith(t + ' '));

      if (matches) {
        console.log(`📩 Comando detectado de ${fromJid}: "${text}". Disparando envio do APK...`);
        try {
          const senderPhone = fromJid.replace('@s.whatsapp.net', '');
          await sendApk(senderPhone);
        } catch (err) {
          console.error('❌ Falha ao processar comando de APK:', err?.message || err);
          await sock.sendMessage(fromJid, {
            text: `❌ Não foi possível gerar ou enviar o APK no momento: ${err?.message || 'Erro interno'}`
          });
        }
      }
    }
  });
}

// --- Servidor HTTP Express ---
const app = express();
app.use(cors());
app.use(express.json());

// Rota de status do serviço
app.get('/status', (req, res) => {
  res.json({
    ok: true,
    connected: isConnected,
    phone: DEFAULT_PHONE,
    user: sock?.user || null
  });
});

// Rota de saúde
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// Rota para disparar o envio de documento/PDF qualquer
app.post('/send-pdf', async (req, res) => {
  const targetPhone = req.body?.phone || DEFAULT_PHONE;
  const filePath = req.body?.filePath;
  const fileName = req.body?.fileName || 'documento.pdf';
  const caption = req.body?.caption || '';

  console.log(`📡 Requisição HTTP POST /send-pdf recebida para ${targetPhone}: ${fileName}`);

  if (!sock || !isConnected) {
    return res.status(503).json({
      success: false,
      error: 'WhatsApp Baileys não está conectado no momento.'
    });
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({
      success: false,
      error: `Arquivo não encontrado no caminho: ${filePath}`
    });
  }

  try {
    const cleanPhone = targetPhone.replace(/\D/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;
    const fileBuffer = fs.readFileSync(filePath);

    await sock.sendMessage(jid, {
      document: fileBuffer,
      mimetype: 'application/pdf',
      fileName: fileName,
      caption: caption
    });

    console.log(`✅ PDF ${fileName} enviado com sucesso para ${cleanPhone}!`);
    return res.json({
      success: true,
      message: `PDF enviado com sucesso para +${targetPhone}`
    });
  } catch (err) {
    console.error('❌ Erro no envio via HTTP /send-pdf:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao enviar PDF'
    });
  }
});

// Rota para disparar o envio do APK (usada pelo app ou curl)
app.post('/send-apk', async (req, res) => {
  const targetPhone = req.body?.phone || DEFAULT_PHONE;
  console.log(`📡 Requisição HTTP POST /send-apk recebida para o telefone: ${targetPhone}`);

  if (!isConnected) {
    return res.status(503).json({
      success: false,
      error: 'WhatsApp Baileys não está conectado no momento. Inicie a conexão e pareie seu WhatsApp.'
    });
  }

  try {
    const result = await sendApk(targetPhone);
    return res.json({
      success: true,
      message: `APK enviado com sucesso para +${targetPhone}`,
      details: result
    });
  } catch (err) {
    console.error('❌ Erro no envio via HTTP /send-apk:', err?.message || err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro ao enviar APK'
    });
  }
});

// Iniciar servidor HTTP
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor HTTP do Baileys Updater rodando na porta ${PORT}`);
  console.log(`🔗 Endpoint para o app: http://localhost:${PORT}/send-apk`);
});

// Iniciar conexão Baileys
connectToWhatsApp();
