# 🚀 Chat API V2 - Documentação Completa do Backend

Esta é a API central de comunicações do aplicativo **Vibe**. Ela orquestra a lógica de tempo real, persistência em bancos de dados baseados em documentos, verificação de criptografia de pontes, disparos automatizados de mensageria 2FA e cache para performance.

---

## 📖 Índice
1. [Visão Geral](#1-visão-geral)
2. [O Fator "Performance Extrema" (Redis)](#2-o-fator-performance-extrema-redis)
3. [Segurança e Criptografia](#3-segurança-e-criptografia)
4. [Estrutura do Banco de Dados (Modelos)](#4-estrutura-do-banco-de-dados-modelos)
5. [Dicionário de Endpoints REST](#5-dicionário-de-endpoints-rest)
6. [Catálogo Socket.io (Tempo Real)](#6-catálogo-socketio-tempo-real)
7. [Iniciação Rápida e Variáveis de Ambiente](#7-iniciação-rápida-e-variáveis-de-ambiente)

---

## 1. Visão Geral
Este backend é isolado e gerencia toda a regra de negócios que não pode (ou não deve) viver no lado do cliente. Construído sobre `Node.js` usando `Express`, e orquestrado primordialmente por **Tokens Assinados do Firebase**, ele só responde a requisições de origem provada.

Foi desenhado usando a **Arquitetura de Controladores e Serviços**, que torna muito mais fácil debugar qualquer erro ou integrar novos serviços como Mailers (`Resend`).

---

## 2. O Fator "Performance Extrema" (Redis)
Ao lidar com chats, listar conversas é o evento que gera mais impacto e atrito com bancos Mongoose (gerando agregações custosas para varrer o número de mensagens não lidas, separar última mensagem, etc.). 

Para resolver a latência (conhecida como problema de I/O em banco físico), aplicamos o **Redis Labs In-Memory Data Store**.

*   **Padrão Utilizado:** `Cache-Aside Pattern`.
*   **Ação:** Um Middleware próprio (`src/middlewares/cache.js`) inspeciona todo tráfego de leitura. Se a requisição `GET /api/conversations/123` tem registro no Redis, ele serve e a requisição finaliza na hora.
*   **Invalidação Inteligente (TTL e Programática):** As salas de grupos expiram após 60s organicamente; Mas se um usuário enviar mensagem agora, no mesmo milissegundo a ação aciona um `clearCache(userId)` nos Controllers limpando o cache sujo para garantir que dados novos estejam no banco imediatamente para qualquer parceiro de chat.

---

## 3. Segurança e Criptografia

*   **REST Protegido:** Nenhuma rota na pasta `src/routes/*` está nua. O middleware `protect` intercepta todas as chamadas verificando os Tokens JWT nativos do Google/Firebase via `firebase-admin`. Sem Token Vivo = Resposta HTTP `401 Unauthorized`.
*   **Mensagens em Repouso (Encryption At Rest):** Os textos salvos de cada mensagem enviada, antes de dar `message.save()`, passam por `encrypt(text)` via o algoritmo interno `AES-256-CTR` com IV Aleatorizado. Se alguém roubar credenciais do MongoDB, lerá uma bagunça de bytes, não os segredos de chat.

---

## 4. Estrutura do Banco de Dados (Modelos)
Empregamos MongoDB/Mongoose. Principais Modelos na pasta `src/models`:

1.  **User Schema:**
    *   Um Proxy Local do Perfil. Replicamos o nome, username único e avatar do Firebase pra dentro de nosso BD local porque o Mongo não pode relatar com o Firebase em Operador Join Custo/Benefício.
2.  **Conversation Schema:**
    *   `participants: [ObjectId_List]`: Controla quem entra no chat. Subdivide o conceito para `Grupos` ativando o bit estático `isGroup`.
    *   `groupAdmin: ObjectId`: Chefe controlador quando em Grupo.
    *   `lastMessage: Object`: Objeto auxiliar gravando nome de quem gravou na última iteração, evitando joins violentos ao mostrar a lista de conversas.
3.  **Message Schema:**
    *   `conversationId`, `senderId`, `text` (Enctryptado), `mediaUrl`, `mediaType` (image, document, audio).
    *   `hiddenFor: [ObjectId_List]`: Exclusão soft (Permite deletar pra mim mesmo mas não pra todos).

---

## 5. Dicionário de Endpoints REST

| Mét | Rota | Descrição Técnica (Efeito na API) | Middleware / Auth |
| :---: | --- | --- | :---: |
| POST | `/api/auth/firebase` | Cadastra usuário do front-end na API ou Sincroniza foto nova. | Necessário |
| POST | `/api/users/2fa/send-code` | Invoca a API de Mailer Resend usando `RESEND_API` para Auth Secundo. | Necessário |
| POST | `/api/conversations/groups` | Gera um Grupo injetando Múltiplos UIDs, salvando `isGroup` flag. | Necessário |
| GET | `/api/conversations/:uid` | Traz Aglomeração MongoDB + Socket status online (Usa Redis). | Necessário |
| POST | `/api/messages` | Salva o payload rest, criptografa, varre a room do WebSockets. | Necessário |
| DELETE| `/api/messages/delete-many` | Suporta Soft Delete com `deleteForEveryone` flags atuando Array Push. | Necessário |

---

## 6. Catálogo Socket.io (Tempo Real)

A magia do tempo real só se aplica na camada ativa onde os aparelhos dos usuários estão ligados na tomada.

### Handshake:
Nenhuma conexão é tolerada na raiz sem Payload Auth Token Firebase no Header.

### Eventos Que A API "Ouve" do Cliente:
*   `send_message(payload)`: Faz todo trabalho do Router Message POST só que em tempo real. Dispara notificação push (`expoPushService`) local e atualiza o MongoDB.
*   `typing`: Varre participante Oposto para apresentar o Toast visual na tela dele.
*   `mark_messages_read`: Quando um abridor de tela entra na sala, esse evento percorre o BD inteiro setando a flag `read: true`. Notifica o rementente.

### Eventos Que A API "Grita" para o Cliente:
*   `receive_message`: "Sua mensagem chegou!".
*   `messages_read`: "O usuário DoOutroLado viu. Exiba 2 checks azuis v2".
*   `messages_deleted`: Requer deleção da tela imediata na UI.

---

## 7. Iniciação Rápida e Variáveis de Ambiente

### .env Obrigatório
Crie as chaves na pasta raiz do server.

```env
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:8880,http://localhost:8081

# Database Connectors Core
MONGODB_URI=mongodb+srv://... (Crie na Cloud Atlas)
REDIS_URL=redis://default:... (Instancia do Cloud Redis)

# Firebase Keys (O JSON do Service Account dissecado:)
FIREBASE_PROJECT_ID=teu_projeto-10111
FIREBASE_CLIENT_EMAIL=admin-sdk-2x....
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nTeu_Chavao...\n-----END PRIVATE KEY-----\n"

# API Extras Control
ENCRYPTION_KEY=Sua_Chave32BytesParaMensagensSeguras123
RESEND_API_KEY=re_Qxxxxx...
DEBUG_SOCKET=1
SOCKET_POPULATE=1
```

### Como conseguir todas as chaves do backend
Use o `.env.example` como base e preencha o `.env` da raiz do backend. Nunca envie o `.env`, JSONs de service account, senhas ou tokens para o GitHub; o `.gitignore` deste projeto ja ignora o `.env`.

Antes de começar, crie uma conta ou faca login nos serviços abaixo:

1. [Firebase Console](https://console.firebase.google.com/) para autenticação e Firebase Admin.
2. [MongoDB Atlas](https://cloud.mongodb.com/) para o banco principal.
3. [Redis Cloud](https://app.redislabs.com/) para cache.
4. [Resend](https://resend.com/) para envio de e-mail/2FA.

#### MongoDB Atlas (`MONGODB_URI`)
1. Acesse [MongoDB Atlas](https://cloud.mongodb.com/).
2. Crie uma conta ou faca login.
3. Crie uma **Organization** e um **Project**, se ainda nao existirem.
4. Entre no projeto e clique em **Build a Database**.
5. Escolha um cluster gratuito/de teste, quando disponivel, e aguarde a criacao.
6. Em **Database Access**, clique em **Add New Database User**.
7. Crie um usuario com senha forte e permissao de leitura/escrita no banco.
8. Em **Network Access**, clique em **Add IP Address**.
9. Para desenvolvimento, libere seu IP atual. Use `0.0.0.0/0` apenas em teste, pois libera qualquer origem.
10. Volte em **Database**, clique em **Connect** no cluster.
11. Escolha **Drivers** e selecione **Node.js**.
12. Copie a connection string.
13. Troque `<password>` pela senha criada e defina o banco no final da URL:

```env
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/chat-api
```

Teste rapido opcional:

```bash
node -e "require('mongoose').connect(process.env.MONGODB_URI).then(()=>console.log('Mongo OK')).catch(console.error)"
```

#### Redis Cloud (`REDIS_URL`)
1. Acesse [Redis Cloud](https://app.redislabs.com/).
2. Crie uma conta ou faca login.
3. Crie uma subscription gratuita/de teste, quando disponivel.
4. Crie um banco Redis.
5. Abra os detalhes do banco.
6. Copie o host, porta, usuario e senha.
7. Monte a URL no formato:

```env
REDIS_URL=redis://usuario:senha@host:porta
```

Quando o painel mostrar um comando assim:

```bash
redis-cli -u redis://default:senha@host:porta
```

Copie apenas a parte depois de `-u` para o `.env`.

#### Firebase Admin SDK (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`)
1. Acesse o [Firebase Console](https://console.firebase.google.com/).
2. Crie uma conta Google ou faca login.
3. Crie um projeto ou abra o projeto usado pelo app.
4. Entre em **Configuracoes do projeto**.
5. Abra a aba **Contas de servico**.
6. Em **Firebase Admin SDK**, clique em **Gerar nova chave privada**.
7. Confirme o download do arquivo `.json`.
8. Abra o JSON em um editor local.
9. Copie estes campos do JSON para o `.env`:

```env
FIREBASE_PROJECT_ID=valor_do_project_id
FIREBASE_CLIENT_EMAIL=valor_do_client_email
FIREBASE_PRIVATE_KEY="valor_do_private_key_com_\n"
```

O campo `private_key` deve ficar entre aspas e manter os `\n`, como no JSON original. Se essa chave vazar, gere uma nova chave no Firebase Console e apague a antiga.

#### Contas de teste no Firebase Auth
Use contas de teste para validar login, conversas e permissao de usuario.

1. No Firebase Console, abra o projeto.
2. Vá em **Authentication**.
3. Clique em **Get started**, se for a primeira vez.
4. Abra **Sign-in method**.
5. Ative **Email/Password**.
6. Abra a aba **Users**.
7. Clique em **Add user**.
8. Crie pelo menos duas contas para testar conversa entre usuarios:

```text
teste1@example.com / senha123456
teste2@example.com / senha123456
```

Use e-mails ficticios apenas em ambiente local. Para testar envio real de e-mail/2FA, use e-mails que voce controla.

#### Resend (`RESEND_API_KEY`)
1. Acesse [Resend](https://resend.com/).
2. Crie uma conta ou faca login.
3. Entre no seu workspace.
4. Abra **API Keys**.
5. Clique em **Create API Key**.
6. Dê um nome como `vibe-dev`.
7. Copie a chave gerada e coloque no `.env`:

```env
RESEND_API_KEY=re_sua_chave
```

Para envio real em producao, configure tambem um dominio em **Domains** e siga a validacao DNS da Resend. Em desenvolvimento, use um e-mail seu para testar recebimento dos codigos 2FA.

#### Chave de criptografia (`ENCRYPTION_KEY`)
Essa chave protege as mensagens salvas no banco. Use uma string secreta forte com 32 caracteres ou mais.

Exemplo para gerar no Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Depois coloque no `.env`:

```env
ENCRYPTION_KEY=sua_chave_gerada
```

#### Variaveis locais (`PORT`, `NODE_ENV`, `CORS_ORIGIN`)
1. `PORT`: porta onde a API vai rodar, normalmente `3000`.
2. `NODE_ENV`: use `development` localmente e `production` em deploy.
3. `CORS_ORIGIN`: coloque as URLs do frontend que podem acessar a API, separadas por virgula.

### Deploy da API no Render
Use este passo a passo quando fizer mudancas no backend e precisar atualizar a API online usada pelo app.

Documentacao oficial util:

1. [Deploy de app Node/Express no Render](https://render.com/docs/deploy-node-express-app)
2. [Web Services no Render](https://render.com/docs/web-services)
3. [Variaveis de ambiente no Render](https://render.com/docs/environment-variables)

#### 1. Suba o backend para o GitHub
O Render faz deploy a partir de um repositorio Git.

```bash
git status
git add .
git commit -m "Atualiza backend"
git push
```

Nao envie o arquivo `.env` para o GitHub. As chaves devem ser cadastradas direto no painel do Render.

#### 2. Crie o Web Service
1. Acesse [Render Dashboard](https://dashboard.render.com/).
2. Clique em **New +**.
3. Escolha **Web Service**.
4. Conecte sua conta GitHub, GitLab ou Bitbucket.
5. Selecione o repositorio da API `chat-api_v2_tested`.
6. Configure:

```text
Name: chat-api-v2-tested
Runtime: Node
Branch: main
Root Directory: deixe vazio se este repositorio for apenas a API
Build Command: npm install
Start Command: npm start
```

O `npm start` deste projeto executa:

```bash
node src/index.js
```

#### 3. Configure as variaveis de ambiente no Render
No Web Service, abra **Environment** e cadastre:

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/chat-api
REDIS_URL=redis://usuario:senha@host:porta
FIREBASE_PROJECT_ID=seu_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_PRIVADA_AQUI\n-----END PRIVATE KEY-----\n"
ENCRYPTION_KEY=sua_chave_gerada
RESEND_API_KEY=re_sua_chave
CORS_ORIGIN=*
```

Observacoes importantes:

1. Nao precisa cadastrar `PORT`; o Render injeta a porta automaticamente e o projeto ja usa `process.env.PORT`.
2. Em producao real, troque `CORS_ORIGIN=*` pela URL do app/site que pode chamar a API.
3. Mantenha o `FIREBASE_PRIVATE_KEY` com os `\n` da chave original.
4. Use a mesma `ENCRYPTION_KEY` sempre. Se trocar, mensagens antigas criptografadas podem deixar de abrir.

#### 4. Faca o primeiro deploy
1. Clique em **Create Web Service**.
2. Aguarde o build terminar.
3. Abra a aba **Logs**.
4. Confirme que aparece algo como:

```text
Servidor rodando na porta ...
MongoDB conectado
```

Quando o deploy terminar, o Render vai gerar uma URL parecida com:

```text
https://chat-api-v2-tested.onrender.com
```

Teste no navegador ou terminal:

```bash
curl https://chat-api-v2-tested.onrender.com
```

#### 5. Atualize o app Expo para usar a API publicada
No projeto `Vibe-mensage`, abra o `.env` e coloque a URL do Render:

```env
EXPO_PUBLIC_CHAT_API_URL=https://chat-api-v2-tested.onrender.com
```

Depois reinicie o Expo limpando cache:

```bash
npx expo start -c
```

#### 6. Como atualizar depois de uma mudanca
Sempre que corrigir o backend:

```bash
git add .
git commit -m "Corrige backend"
git push
```

Se o Render estiver com auto deploy ativo, ele publica sozinho. Se nao estiver, abra o Web Service no Render e clique em **Manual Deploy > Deploy latest commit**.

#### 7. Checklist para problemas comuns
1. **Deploy falha no build:** confira se `Build Command` esta `npm install`.
2. **API sobe mas nao conecta no Mongo:** confira `MONGODB_URI` e libere IP no MongoDB Atlas. Para Render, use `0.0.0.0/0` em teste.
3. **Firebase retorna 401:** confira `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`.
4. **Socket nao atualiza em tempo real:** confira se o app usa exatamente a URL do Render em `EXPO_PUBLIC_CHAT_API_URL` e reinicie o Expo.
5. **Visto/cache nao atualiza:** depois do deploy, envie uma nova mensagem e abra a conversa no outro dispositivo. Mensagens antigas podem precisar recarregar a lista.

### Instalação e Servidor de Dev:
O projeto usa `pnpm`, mas tolera `npm`.

1. `npm install`
2. `npm run dev` (Inicia Nodemon monitorando modificações. Socket.io sobe junto na Porta Principal 3000 atrelado ao app Server HTTP nativo).

---
*Fim da documentação unificada backend. Atividade Vibe Chat.*
