# Documentacao da API de Chat

Esta documentacao descreve a API REST e o fluxo de tempo real da Chat API com Node.js, Express, MongoDB, Socket.IO e Firebase Authentication.

## 1. Visao geral

A API oferece:

- autenticacao baseada em Firebase ID Token
- sincronizacao de usuarios no MongoDB
- conversas privadas
- envio de mensagens de texto e midia
- socket em tempo real
- status de mensagem com leitura (`read`)
- **Sanitização de Mensagens (XSS Protection)**
- **Criptografia AES-256 das mensagens em repouso**
- **Logs de Auditoria de Ações Importantes**

## 2. Estrutura do projeto

```text
chat-api_v2_tested/
├── src/
│   ├── config/
│   │   ├── db.js
│   │   └── firebaseAdmin.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── conversationController.js
│   │   ├── mediaController.js
│   │   ├── messageController.js
│   │   └── userController.js
│   ├── middlewares/
│   │   └── auth.js
│   ├── models/
│   │   ├── Conversation.js
│   │   ├── Message.js
│   │   └── User.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── conversationRoutes.js
│   │   ├── mediaRoutes.js
│   │   ├── messageRoutes.js
│   │   └── userRoutes.js
│   ├── sockets/
│   │   ├── chatSocket.js
│   │   └── socketStore.js
│   ├── app.js
│   └── index.js
├── uploads/
├── .env
└── API_DOCUMENTATION.md
```

## 3. Modelos de dados

### 3.1. User

Representa um usuario sincronizado na Chat API.

| Campo | Tipo | Descricao |
| --- | --- | --- |
| `_id` | `ObjectId` | ID interno do MongoDB |
| `username` | `String` | Email/login do usuario |
| `nome` | `String` | Nome exibido |
| `foto` | `String` | URL da foto de perfil |
| `firebaseUid` | `String` | UID do Firebase vinculado ao usuario |
| `createdAt` | `Date` | Criacao |
| `updatedAt` | `Date` | Atualizacao |

### 3.2. Conversation

Representa uma conversa privada.

| Campo | Tipo | Descricao |
| --- | --- | --- |
| `_id` | `ObjectId` | ID da conversa |
| `participants` | `ObjectId[]` | Participantes da conversa |
| `lastMessage.text` | `String` | Ultimo texto ou resumo da ultima mensagem |
| `lastMessage.senderId` | `ObjectId` | Remetente da ultima mensagem |
| `lastMessage.createdAt` | `Date` | Data da ultima mensagem |
| `createdAt` | `Date` | Criacao |
| `updatedAt` | `Date` | Atualizacao |

### 3.3. Message

Representa uma mensagem de chat.

| Campo | Tipo | Descricao |
| --- | --- | --- |
| `_id` | `ObjectId` | ID da mensagem |
| `conversationId` | `ObjectId` | Conversa a que pertence |
| `senderId` | `ObjectId` | Usuario remetente |
| `text` | `String` | Texto da mensagem |
| `mediaUrl` | `String` | URL da midia enviada |
| `mediaType` | `String` | `image`, `video`, `audio`, `document`, `file` ou `null` |
| `read` | `Boolean` | Se a mensagem ja foi lida pelo destinatario |
| `createdAt` | `Date` | Criacao |
| `updatedAt` | `Date` | Atualizacao |

## 4. Autenticacao

A API usa Firebase Authentication.

Fluxo:

1. O cliente autentica o usuario no Firebase.
2. O cliente pega o `Firebase ID Token`.
3. O cliente envia `Authorization: Bearer <firebase_id_token>`.
4. A API valida o token com `firebase-admin`.
5. A API usa o usuario sincronizado no MongoDB para autorizar os recursos.

O socket tambem usa o token do Firebase no handshake:

```js
const socket = io(BASE_URL, {
  auth: {
    token: firebaseIdToken,
  },
});
```

## 5. Endpoints REST

Todos os endpoints protegidos exigem `Authorization: Bearer <firebase_id_token>`.

### 5.1. Auth

#### `POST /api/auth/firebase`

Sincroniza o usuario autenticado no Firebase com o MongoDB da Chat API.

Corpo:

```json
{
  "email": "usuario@email.com",
  "displayName": "Nome do Usuario",
  "photoURL": "https://example.com/avatar.jpg"
}
```

Resposta:

```json
{
  "_id": "65f1234567890abcdef1234",
  "username": "usuario@email.com",
  "nome": "Nome do Usuario",
  "foto": "https://example.com/avatar.jpg"
}
```

### 5.2. Users

#### `GET /api/users`

Lista usuarios sincronizados.

Query opcional:

- `q`: termo de busca

Exemplo:

```http
GET /api/users?q=diego
```

#### `POST /api/users`

Cadastro por senha desativado. Mantido apenas por compatibilidade.

#### `POST /api/users/login`

Login por senha desativado. Mantido apenas por compatibilidade.

### 5.3. Conversations

#### `POST /api/conversations`

Cria ou recupera uma conversa privada.

Corpo:

```json
{
  "participantId": "65f1234567890abcdef9999"
}
```

#### `GET /api/conversations/:userId`

Lista as conversas do usuario autenticado.

#### `DELETE /api/conversations/:conversationId`

Exclui a conversa e as mensagens associadas.

### 5.4. Messages

#### `POST /api/messages`

Envia mensagem por REST.

Corpo:

```json
{
  "conversationId": "65f1234567890abcdef5555",
  "text": "Ola, tudo bem?",
  "mediaUrl": null,
  "mediaType": null
}
```

Resposta:

```json
{
  "_id": "65f1234567890abcdef7777",
  "conversationId": "65f1234567890abcdef5555",
  "senderId": "65f1234567890abcdef1111",
  "text": "Ola, tudo bem?",
  "mediaUrl": null,
  "mediaType": null,
  "read": false,
  "createdAt": "2026-03-21T21:10:00.000Z",
  "updatedAt": "2026-03-21T21:10:00.000Z"
}
```

#### `GET /api/messages/:conversationId`

Lista as mensagens da conversa em ordem crescente.

Importante:

- ao abrir a conversa, a API marca como lidas as mensagens recebidas pelo usuario autenticado
- quando isso acontece, a API emite `messages_read` para o remetente via socket

Resposta:

```json
[
  {
    "_id": "65f1234567890abcdef7777",
    "conversationId": "65f1234567890abcdef5555",
    "senderId": {
      "_id": "65f1234567890abcdef1111",
      "nome": "Diego",
      "username": "diego@email.com",
      "foto": "https://example.com/avatar.jpg"
    },
    "text": "Ola, tudo bem?",
    "mediaUrl": null,
    "mediaType": null,
    "read": true,
    "createdAt": "2026-03-21T21:10:00.000Z",
    "updatedAt": "2026-03-21T21:12:00.000Z"
  }
]
```

#### `POST /api/messages/:conversationId/read`

Marca como lidas as mensagens da conversa cujo remetente seja outro usuario.

Resposta:

```json
{
  "message": "Mensagens marcadas como lidas",
  "modifiedCount": 2,
  "messageIds": [
    "65f1234567890abcdef7777",
    "65f1234567890abcdef8888"
  ]
}
```

#### `DELETE /api/messages/:messageId`

Apaga uma mensagem especifica e recalcula o `lastMessage` da conversa.

Query/body opcional:

- `deleteForEveryone`: boolean

Resposta:

```json
{
  "message": "Mensagem apagada com sucesso",
  "conversationId": "65f1234567890abcdef5555",
  "messageIds": [
    "65f1234567890abcdef7777"
  ],
  "deletedBy": "65f1234567890abcdef1111",
  "deleteForEveryone": true,
  "lastMessage": {
    "text": "Mensagem anterior",
    "senderId": "65f1234567890abcdef2222",
    "createdAt": "2026-03-21T21:00:00.000Z"
  }
}
```

#### `POST /api/messages/delete-many`

Apaga varias mensagens de uma unica conversa.

Corpo:

```json
{
  "messageIds": [
    "65f1234567890abcdef7777",
    "65f1234567890abcdef8888"
  ],
  "deleteForEveryone": true
}
```

Resposta:

```json
{
  "message": "Mensagens apagadas com sucesso",
  "deletedCount": 2,
  "conversationId": "65f1234567890abcdef5555",
  "messageIds": [
    "65f1234567890abcdef7777",
    "65f1234567890abcdef8888"
  ],
  "deletedBy": "65f1234567890abcdef1111",
  "deleteForEveryone": true,
  "lastMessage": {
    "text": "Mensagem anterior",
    "senderId": "65f1234567890abcdef2222",
    "createdAt": "2026-03-21T21:00:00.000Z"
  }
}
```

### 5.5. Media

#### `POST /api/media/upload` (DEPRECADO)

> ⚠️ **Aviso:** Este endpoint foi descontinuado devido ao disco efêmero do Render gratuito apagar os arquivos a cada restart.
> 
> **Novo Fluxo:** O App Mobile agora faz o upload dos arquivos diretamente para o **Cloudinary** e envia apenas a `mediaUrl` permanente gerada para a API através dos endpoints de mensagem (`POST /api/messages` ou socket `send_message`). A API atua apenas como ponte.

## 6. Socket.IO

### 6.1. Autenticacao

O socket so conecta se o cliente enviar o `firebase_id_token` no handshake:

```js
const socket = io(BASE_URL, {
  transports: ['websocket'],
  auth: {
    token: firebaseIdToken,
  },
});
```

### 6.2. Eventos do cliente para o servidor

#### `connect_user`

Evento opcional de compatibilidade. A autenticacao real ja foi feita no handshake.

#### `send_message`

Payload:

```json
{
  "conversationId": "65f1234567890abcdef5555",
  "senderId": "65f1234567890abcdef1111",
  "receiverId": "65f1234567890abcdef2222",
  "text": "Mensagem em tempo real",
  "mediaUrl": null,
  "mediaType": null
}
```

Efeito:

- salva a mensagem
- atualiza `lastMessage` na conversa
- emite `receive_message` para remetente e destinatario

#### `typing`

Envia indicador de digitacao.

#### `stop_typing`

Envia parada de digitacao.

#### `typing_status`

Alias adicional de digitacao.

#### `typingStatus`

Alias adicional de digitacao.

#### `mark_messages_read`

Marca mensagens da conversa como lidas.

Payload:

```json
{
  "conversationId": "65f1234567890abcdef5555"
}
```

### 6.2.1. Observacao sobre remocao

Atualmente a API remove a mensagem do banco de forma real. O campo `deleteForEveryone` ja e aceito para compatibilidade com o app, mas como o backend ainda nao possui um modelo separado de "apagar so para mim", a remocao efetiva continua apagando a mensagem da conversa persistida.

Ack de sucesso:

```json
{
  "ok": true,
  "modifiedCount": 2,
  "messageIds": [
    "65f1234567890abcdef7777",
    "65f1234567890abcdef8888"
  ]
}
```

### 6.3. Eventos do servidor para o cliente

#### `user_connected`

Emitido quando o socket do usuario autentica e entra na room dele.

#### `receive_message`

Emitido quando uma nova mensagem e recebida/sincronizada.

Exemplo:

```json
{
  "_id": "65f1234567890abcdef7777",
  "conversationId": "65f1234567890abcdef5555",
  "senderId": "65f1234567890abcdef1111",
  "text": "Mensagem em tempo real",
  "mediaUrl": null,
  "mediaType": null,
  "read": false,
  "createdAt": "2026-03-21T21:10:00.000Z",
  "updatedAt": "2026-03-21T21:10:00.000Z"
}
```

#### `messages_read`

Emitido para o remetente quando o outro participante le a conversa.

Payload:

```json
{
  "conversationId": "65f1234567890abcdef5555",
  "readerId": "65f1234567890abcdef2222",
  "messageIds": [
    "65f1234567890abcdef7777",
    "65f1234567890abcdef8888"
  ],
  "read": true
}
```

#### `messages_deleted`

Emitido para os participantes quando uma ou mais mensagens sao apagadas.

Payload:

```json
{
  "conversationId": "65f1234567890abcdef5555",
  "messageIds": [
    "65f1234567890abcdef7777",
    "65f1234567890abcdef8888"
  ],
  "deletedBy": "65f1234567890abcdef1111",
  "deleteForEveryone": true,
  "lastMessage": {
    "text": "Mensagem anterior",
    "senderId": "65f1234567890abcdef2222",
    "createdAt": "2026-03-21T21:00:00.000Z"
  }
}
```

#### `typing`

#### `stop_typing`

#### `typing_status`

#### `typingStatus`

Eventos de digitacao retransmitidos ao outro usuario.

## 7. Status de mensagem no cliente

Fluxo visual esperado no app:

- `sent`: 1 check
- `delivered`: 2 checks
- `read`: 2 checks coloridos

Importante:

- a API persiste apenas `read`
- `sent` e `delivered` podem ser controlados pelo frontend com envio otimista + confirmacao por `receive_message`
- `read` depende do backend emitir `messages_read` ou devolver a mensagem ja com `read: true`

## 8. Exemplo de fluxo completo

1. Usuario faz login no Firebase.
2. Cliente chama `POST /api/auth/firebase`.
3. Cliente conecta no Socket.IO com `auth.token`.
4. Usuario A envia `send_message`.
5. API salva e emite `receive_message` para A e B.
6. Usuario B abre a conversa.
7. API marca as mensagens como `read: true`.
8. API emite `messages_read` para A.
9. App de A muda o status visual para lido.

Fluxo de apagado:

1. Usuario seleciona uma ou mais mensagens no app.
2. Cliente chama `POST /api/messages/delete-many`.
3. API apaga as mensagens no MongoDB.
4. API recalcula o `lastMessage` da conversa.
5. API emite `messages_deleted` para os participantes.
6. Os clientes removem as mensagens da UI e atualizam a lista de conversas.

## 9. Observacoes de seguranca

- nao use senha propria da Chat API como auth principal
- nao confie em `senderId` vindo do cliente sem validar o usuario autenticado
- use sempre o usuario autenticado a partir do token Firebase
- o Socket.IO deve ser autenticado no handshake
- **Criptografia:** O segredo `ENCRYPTION_KEY` deve ser de 32 caracteres.
- **Deleção:** Apenas o autor original pode deletar para todos (`deleteForEveryone`).
- **Sanitização:** Todas as mensagens são limpas automaticamente para remover tags HTML/Scripts.

## 10. Validacao local

Arquivos principais do fluxo:

- `src/config/firebaseAdmin.js`
- `src/middlewares/auth.js`
- `src/controllers/authController.js`
- `src/controllers/messageController.js`
- `src/routes/messageRoutes.js`
- `src/sockets/chatSocket.js`
- `src/sockets/socketStore.js`

Exemplo de teste simples:

```bash
node -e "require('./src/controllers/messageController'); require('./src/sockets/chatSocket'); require('./src/app'); console.log('ok')"
```

## 11. Deploy no Render

Para o deploy funcionar corretamente no Render, configure as variaveis de ambiente do servico.

### 11.1. Variaveis obrigatorias

- `PORT`
- `MONGO_URI`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

Exemplo:

```env
PORT=3000
MONGO_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/chat
FIREBASE_PROJECT_ID=telegram-clone-32b5c
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@telegram-clone-32b5c.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nSUA_CHAVE_AQUI\n-----END PRIVATE KEY-----\n"
```

### 11.2. Variaveis opcionais

- `CORS_ORIGIN`
- `SOCKET_POPULATE`
- `DEBUG_SOCKET`

### 11.3. Onde configurar no Render

No painel do Render:

1. Abra o Web Service da API
2. Entre em `Environment`
3. Adicione cada variavel em `Environment Variables`
4. Salve as alteracoes
5. Rode um novo deploy

### 11.4. Observacoes importantes

- `FIREBASE_PRIVATE_KEY` deve ficar com `\n` escapado dentro da string
- nunca coloque essas credenciais no app mobile
- essas credenciais sao apenas do backend
- mantenha `.env` fora do Git
- se usar `pnpm`, mantenha o `pnpm-lock.yaml` sincronizado para evitar falha com `--frozen-lockfile`

### 11.5. Checklist rapido de producao

- Firebase Admin configurado
- MongoDB acessivel pelo Render
- CORS apontando para o frontend correto
- rota `POST /api/auth/firebase` funcionando
- socket autenticando com token Firebase
- evento `messages_read` chegando no cliente
- endpoint de delecao de mensagens respondendo
- evento `messages_deleted` chegando no cliente
- deploy mais recente com lockfile atualizado
- **Cloudinary:** Certifique-se de que o App envia a URL permanente do Cloudinary em `mediaUrl`.

---

Atualizado em 23 de marco de 2026.
