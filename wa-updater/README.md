# Baileys WhatsApp APK Updater — Chácara Inventário

Micro-serviço em Node.js com `@whiskeysockets/baileys` para envio automático do arquivo `.apk` de atualização para o seu próprio WhatsApp (`+55 11 96832-6792`).

---

## 🚀 Como Iniciar e Parear (Primeira Vez)

1. No terminal do M31, inicie o serviço:
```bash
npm run wa:start
# ou: cd wa-updater && npm start
```

2. Como não há sessão ativa, ele exibirá o **Código de Pareamento de 8 dígitos** no terminal:
```text
======================================================
📲 CÓDIGO DE PAREAMENTO DO WHATSAPP GERADO COM SUCESSO:
👉  ABCD-EFGH  👈
======================================================
```

3. No seu WhatsApp no celular:
   - Abra **Configurações > Aparelhos Conectados**
   - Toque em **"Conectar um aparelho"**
   - Embaixo, toque em **"Conectar com número de telefone"**
   - Digite o código de 8 dígitos exibido no terminal.

4. Pronto! A sessão fica salva com segurança na pasta `wa-updater/auth_info/` (ignorada pelo Git). Nas próximas vezes, o bot conecta automaticamente sem pedir código de novo.

---

## 🎯 3 Formas de Disparar o Envio do APK

### 1. Pelo Aplicativo (Quando a atualização falhar)
- Quando a atualização OTA pelo app falha (ou se preferir instalar manualmente), o modal exibe o botão:
  **"📲 Receber APK no WhatsApp"**
- O app chama o endpoint HTTP local `http://localhost:3080/send-apk`.
- O APK é enviado imediatamente no seu WhatsApp como documento executável do Android.

### 2. Pelo Chat do WhatsApp
- Basta enviar uma mensagem no WhatsApp com:
  `apk` ou `atualizar` ou `update`
- O bot detecta o comando e responde com o arquivo `.apk` mais recente para você instalar!

### 3. Pelo Terminal (CLI)
A qualquer momento, com o serviço rodando, você pode disparar pelo terminal:
```bash
npm run wa:send
# ou: cd wa-updater && npm run send-apk
```

---

## 📦 De onde vem o APK?
1. Se houver um arquivo compilado em `Chacara-Inventario.apk` na raiz do projeto, ele envia esse arquivo local.
2. Se não houver arquivo local, ele busca e baixa automaticamente o APK da release mais recente do GitHub (`leeeopr/chacara-inventario`).
