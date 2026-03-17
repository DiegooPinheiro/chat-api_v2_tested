# Documentação da API de Chat

Esta documentação detalha a API RESTful e a funcionalidade de chat em tempo real desenvolvida com Node.js, Express.js, MongoDB e Socket.IO.

## 1. Visão Geral

A API de Chat permite a comunicação privada entre usuários, com recursos de envio, recebimento e listagem de mensagens e conversas. A arquitetura foi projetada para ser escalável e extensível para futuras funcionalidades como grupos, envio de mídia e notificações.

## 2. Estrutura do Projeto

```
chat-api/
├── src/
│   ├── controllers/          # Lógica de negócio para cada rota
│   │   ├── conversationController.js
│   │   ├── messageController.js
│   │   ├── mediaController.js        # Novo: Controlador para upload de mídia
│   │   └── userController.js
│   ├── models/               # Definições dos esquemas do MongoDB
│   │   ├── Conversation.js
│   │   ├── Message.js
│   │   └── User.js
│   ├── routes/               # Definição das rotas da API
│   │   ├── conversationRoutes.js
│   │   ├── messageRoutes.js
│   │   ├── mediaRoutes.js            # Novo: Rotas para upload de mídia
│   │   └── userRoutes.js
│   ├── sockets/              # Lógica para comunicação WebSocket
│   │   └── chatSocket.js
│   ├── config/               # Configurações do banco de dados e outros
│   │   └── db.js
│   ├── middlewares/          # Middlewares de autenticação e validação
│   │   └── auth.js
│   ├── utils/                # Utilitários diversos (atualmente vazio)
│   ├── app.js                # Configuração principal do Express
│   └── index.js              # Ponto de entrada do servidor
├── uploads/                  # Novo: Diretório para uploads locais (apenas dev)
└── .env                      # Variáveis de ambiente
└── package.json              # Dependências e scripts do projeto
└── API_DOCUMENTATION.md      # Esta documentação
```

## 3. Modelos de Dados

### 3.1. Usuário (`User`)

Representa um usuário na plataforma.

| Campo      | Tipo     | Descrição                                    | Requisitos       |
| :--------- | :------- | :------------------------------------------- | :--------------- |
| `_id`      | `ObjectId` | Identificador único do usuário               | Gerado automaticamente |
| `username` | `String` | Nome de usuário único                        | Obrigatório, único, trim, lowercase |
| `nome`     | `String` | Nome completo do usuário                     | Obrigatório      |
| `password` | `String` | Senha do usuário (hash)                      | Obrigatório, min 6 caracteres, não selecionável |
| `foto`     | `String` | URL da foto de perfil (opcional)             | Opcional         |
| `createdAt`| `Date`   | Data de criação do usuário                   | Gerado automaticamente |
| `updatedAt`| `Date`   | Data da última atualização do usuário        | Gerado automaticamente |

### 3.2. Conversa (`Conversation`)

Representa uma conversa privada entre dois usuários.

| Campo          | Tipo       | Descrição                                    | Requisitos       |
| :------------- | :--------- | :------------------------------------------- | :--------------- |
| `_id`          | `ObjectId` | Identificador único da conversa              | Gerado automaticamente |
| `participants` | `Array<ObjectId>` | IDs dos usuários participantes da conversa | Obrigatório, ref: `User` |
| `lastMessage`  | `Object`   | Última mensagem enviada na conversa          | Opcional         |
| `lastMessage.text` | `String` | Texto da última mensagem                     |                  |
| `lastMessage.senderId` | `ObjectId` | ID do remetente da última mensagem         | Ref: `User`      |
| `lastMessage.createdAt` | `Date` | Data de envio da última mensagem             |                  |
| `createdAt`    | `Date`     | Data de criação da conversa                  | Gerado automaticamente |
| `updatedAt`    | `Date`     | Data da última atualização da conversa       | Gerado automaticamente |

### 3.3. Mensagem (`Message`)

Representa uma mensagem enviada em uma conversa, agora com suporte a mídias (fotos, vídeos, áudios, documentos, etc.).

| Campo          | Tipo       | Descrição                                    | Requisitos       |
| :------------- | :--------- | :------------------------------------------- | :--------------- |
| `_id`          | `ObjectId` | Identificador único da mensagem              | Gerado automaticamente |
| `conversationId` | `ObjectId` | ID da conversa à qual a mensagem pertence    | Obrigatório, ref: `Conversation` |
| `senderId`     | `ObjectId` | ID do usuário que enviou a mensagem          | Obrigatório, ref: `User` |
| `text`         | `String`   | Conteúdo da mensagem (opcional se `mediaUrl` presente) | Trim, não vazio se `mediaUrl` ausente |
| `mediaUrl`     | `String`   | URL da mídia (foto/vídeo/áudio/documento) anexada (opcional) | Padrão: `null`   |
| `mediaType`    | `String`   | Tipo da mídia (`image`, `video`, `audio`, `document`, `file`) | Enum: `image`, `video`, `audio`, `document`, `file`, `null` |
| `read`         | `Boolean`  | Indica se a mensagem foi lida                | Padrão: `false`  |
| `createdAt`    | `Date`     | Data de envio da mensagem                    | Gerado automaticamente |
| `updatedAt`    | `Date`     | Data da última atualização da mensagem       | Gerado automaticamente |

## 4. Autenticação (JWT)

A API utiliza JSON Web Tokens (JWT) para autenticação. Após o login, um token é retornado e deve ser incluído em todas as requisições protegidas no cabeçalho `Authorization` como `Bearer <token>`.

## 5. Endpoints REST

Todos os endpoints protegidos requerem um token JWT válido no cabeçalho `Authorization`.

### 5.1. Usuários

#### `POST /api/users` - Registrar novo usuário

Cria uma nova conta de usuário.

- **Corpo da Requisição:**
  ```json
  {
    "username": "novo_usuario",
    "nome": "Nome Completo",
    "password": "senha123",
    "foto": "https://example.com/foto.jpg" (opcional)
  }
  ```
- **Resposta de Sucesso (201 Created):**
  ```json
  {
    "_id": "60c72b2f9b1e8b001c8e4d1a",
    "username": "novo_usuario",
    "nome": "Nome Completo",
    "foto": "https://example.com/foto.jpg",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

#### `POST /api/users/login` - Autenticar usuário

Autentica um usuário e retorna um token JWT.

- **Corpo da Requisição:**
  ```json
  {
    "username": "usuario_existente",
    "password": "senha123"
  }
  ```
- **Resposta de Sucesso (200 OK):**
  ```json
  {
    "_id": "60c72b2f9b1e8b001c8e4d1a",
    "username": "usuario_existente",
    "nome": "Nome Completo",
    "foto": "https://example.com/foto.jpg",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

#### `GET /api/users/profile` - Obter perfil do usuário logado

Retorna os dados do perfil do usuário autenticado.

- **Cabeçalhos:** `Authorization: Bearer <token>`
- **Resposta de Sucesso (200 OK):**
  ```json
  {
    "_id": "60c72b2f9b1e8b001c8e4d1a",
    "username": "usuario_logado",
    "nome": "Nome do Usuário Logado",
    "foto": "https://example.com/foto.jpg"
  }
  ```

### 5.2. Conversas

#### `POST /api/conversations` - Criar ou obter conversa

Cria uma nova conversa privada entre o usuário autenticado e outro usuário. Se a conversa já existir, retorna a conversa existente.

- **Cabeçalhos:** `Authorization: Bearer <token>`
- **Corpo da Requisição:**
  ```json
  {
    "participantId": "60c72b2f9b1e8b001c8e4d1b" // ID do outro usuário
  }
  ```
- **Resposta de Sucesso (201 Created ou 200 OK):**
  ```json
  {
    "_id": "60c72b2f9b1e8b001c8e4d1c",
    "participants": [
      "60c72b2f9b1e8b001c8e4d1a",
      "60c72b2f9b1e8b001c8e4d1b"
    ],
    "createdAt": "2023-10-27T10:00:00.000Z",
    "updatedAt": "2023-10-27T10:00:00.000Z"
  }
  ```

#### `GET /api/conversations/:userId` - Listar conversas de um usuário

Lista todas as conversas das quais o usuário especificado é participante. O `userId` na URL deve ser o ID do usuário autenticado.

- **Cabeçalhos:** `Authorization: Bearer <token>`
- **Parâmetros de URL:** `userId` (ID do usuário logado)
- **Resposta de Sucesso (200 OK):**
  ```json
  [
    {
      "_id": "60c72b2f9b1e8b001c8e4d1c",
      "participants": [
        { "_id": "60c72b2f9b1e8b001c8e4d1a", "nome": "Usuário A", "username": "usera" },
        { "_id": "60c72b2f9b1e8b001c8e4d1b", "nome": "Usuário B", "username": "userb" }
      ],
      "lastMessage": {
        "text": "Olá!",
        "senderId": "60c72b2f9b1e8b001c8e4d1a",
        "createdAt": "2023-10-27T10:05:00.000Z"
      },
      "createdAt": "2023-10-27T10:00:00.000Z",
      "updatedAt": "2023-10-27T10:05:00.000Z"
    }
  ]
  ```

### 5.3. Mensagens

#### `POST /api/messages` - Enviar mensagem (texto ou mídia)

Envia uma nova mensagem para uma conversa existente. Suporta mensagens de texto e/ou com anexo de mídia.

- **Cabeçalhos:** `Authorization: Bearer <token>`
- **Corpo da Requisição:**
  ```json
  {
    "conversationId": "60c72b2f9b1e8b001c8e4d1c",
    "text": "Olá, como você está?", // Opcional se mediaUrl presente
    "mediaUrl": "https://example.com/image.jpg", // Opcional
    "mediaType": "image" // Opcional, deve ser 'image', 'video', 'audio', 'document' ou 'file' se mediaUrl presente
  }
  ```
- **Resposta de Sucesso (201 Created):**
  ```json
  {
    "_id": "60c72b2f9b1e8b001c8e4d1d",
    "conversationId": "60c72b2f9b1e8b001c8e4d1c",
    "senderId": "60c72b2f9b1e8b001c8e4d1a",
    "text": "Olá, como você está?",
    "mediaUrl": "https://example.com/image.jpg",
    "mediaType": "image",
    "read": false,
    "createdAt": "2023-10-27T10:06:00.000Z",
    "updatedAt": "2023-10-27T10:06:00.000Z"
  }
  ```

#### `GET /api/messages/:conversationId` - Listar mensagens de uma conversa

Lista todas as mensagens de uma conversa específica.

- **Cabeçalhos:** `Authorization: Bearer <token>`
- **Parâmetros de URL:** `conversationId` (ID da conversa)
- **Resposta de Sucesso (200 OK):**
  ```json
  [
    {
      "_id": "60c72b2f9b1e8b001c8e4d1d",
      "conversationId": "60c72b2f9b1e8b001c8e4d1c",
      "senderId": {
        "_id": "60c72b2f9b1e8b001c8e4d1a",
        "nome": "Usuário A",
        "username": "usera"
      },
      "text": "Olá, como você está?",
      "mediaUrl": "https://example.com/image.jpg",
      "mediaType": "image",
      "read": false,
      "createdAt": "2023-10-27T10:06:00.000Z",
      "updatedAt": "2023-10-27T10:06:00.000Z"
    }
  ]
  ```

### 5.4. Mídia

#### `POST /api/media/upload` - Upload de Arquivos de Mídia

Este endpoint é responsável por receber um arquivo (imagem, vídeo, áudio, documento, etc.), armazená-lo (localmente para desenvolvimento, ou em um serviço de nuvem em produção) e retornar a URL de acesso e o tipo de mídia.

- **Cabeçalhos:** `Authorization: Bearer <token>`
- **Corpo da Requisição:** `multipart/form-data` com um campo `media` contendo o arquivo.
  *   **Exemplo com `fetch` (Frontend):**
    ```javascript
    const formData = new FormData();
    formData.append('media', seuArquivoInput.files[0]);

    const response = await fetch(`${BASE_URL}/media/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
        // 'Content-Type': 'multipart/form-data' é adicionado automaticamente pelo navegador com FormData
      },
      body: formData
    });
    const data = await response.json();
    console.log('Upload de Mídia:', data); // data conterá mediaUrl, mediaType, etc.
    ```
- **Resposta de Sucesso (200 OK):**
  ```json
  {
    "message": "Upload realizado com sucesso",
    "mediaUrl": "/uploads/media-1678886400000-123456789.png", // Em produção, será uma URL de CDN/S3
    "mediaType": "image", // ou 'video', 'audio', 'document', 'file'
    "fileName": "minha_foto.png",
    "size": 123456
  }
  ```

## 6. Chat em Tempo Real (WebSocket com Socket.IO)

A API oferece comunicação em tempo real para mensagens usando WebSockets via Socket.IO. O cliente deve se conectar ao servidor WebSocket e emitir/ouvir os eventos definidos.

- **URL do WebSocket:** `ws://localhost:3000` (ou a URL do seu servidor)

### 6.1. Eventos do Cliente para o Servidor

#### `connect_user`

Enviado pelo cliente para informar seu `userId` ao servidor, permitindo que o servidor rastreie usuários online.

- **Payload:** `userId` (String)
- **Exemplo:**
  ```javascript
  socket.emit("connect_user", "60c72b2f9b1e8b001c8e4d1a");
  ```

#### `send_message`

Enviado pelo cliente para enviar uma nova mensagem (texto ou mídia). O servidor salvará a mensagem no banco de dados e a retransmitirá para o destinatário em tempo real.

- **Payload:** Objeto com `conversationId`, `senderId`, `text` (opcional), `receiverId`, `mediaUrl` (opcional), `mediaType` (opcional).
- **Exemplo (Mensagem de Texto):**
  ```javascript
  socket.emit("send_message", {
    conversationId: "60c72b2f9b1e8b001c8e4d1c",
    senderId: "60c72b2f9b1e8b001c8e4d1a",
    text: "Esta é uma mensagem em tempo real!",
    receiverId: "60c72b2f9b1e8b001c8e4d1b"
  });
  ```
- **Exemplo (Mensagem com Imagem):**
  ```javascript
  socket.emit("send_message", {
    conversationId: "60c72b2f9b1e8b001c8e4d1c",
    senderId: "60c72b2f9b1e8b001c8e4d1a",
    mediaUrl: "https://seuservico.com/imagens/minha_foto.jpg",
    mediaType: "image",
    receiverId: "60c72b2f9b1e8b001c8e4d1b"
  });
  ```
- **Exemplo (Mensagem com PDF):**
  ```javascript
  socket.emit("send_message", {
    conversationId: "60c72b2f9b1e8b001c8e4d1c",
    senderId: "60c72b2f9b1e8b001c8e4d1a",
    mediaUrl: "https://seuservico.com/documentos/relatorio.pdf",
    mediaType: "document",
    receiverId: "60c72b2f9b1e8b001c8e4d1b"
  });
  ```
- **Exemplo (Mensagem com Áudio):**
  ```javascript
  socket.emit("send_message", {
    conversationId: "60c72b2f9b1e8b001c8e4d1c",
    senderId: "60c72b2f9b1e8b001c8e4d1a",
    mediaUrl: "https://seuservico.com/audios/mensagem_voz.mp3",
    mediaType: "audio",
    receiverId: "60c72b2f9b1e8b001c8e4d1b"
  });
  ```

### 6.2. Eventos do Servidor para o Cliente

#### `receive_message`

Recebido pelo cliente quando uma nova mensagem é enviada para ele (seja por ele mesmo ou por outro usuário na mesma conversa).

- **Payload:** Objeto `Message` (conforme o modelo de dados, incluindo `mediaUrl` e `mediaType` se houver).
- **Exemplo:**
  ```javascript
  socket.on("receive_message", (message) => {
    console.log("Nova mensagem recebida:", message);
    // Atualizar UI do chat, exibindo texto ou mídia conforme `message.mediaType`
  });
  ```

## 7. Exemplos de Requisição (usando `fetch`)

```javascript
const BASE_URL = "http://localhost:3000/api"; // Ou a URL da sua API
let authToken = ""; // Armazenar o token JWT após o login

// 1. Registrar Usuário
async function registerUser(username, nome, password) {
  try {
    const response = await fetch(`${BASE_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, nome, password })
    });
    const data = await response.json();
    console.log("Registro:", data);
    if (response.ok) {
      authToken = data.token;
      console.log("Token JWT:", authToken);
    }
    return data;
  } catch (error) {
    console.error("Erro ao registrar:", error);
  }
}

// 2. Login de Usuário
async function loginUser(username, password) {
  try {
    const response = await fetch(`${BASE_URL}/users/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    console.log("Login:", data);
    if (response.ok) {
      authToken = data.token;
      console.log("Token JWT:", authToken);
    }
    return data;
  } catch (error) {
    console.error("Erro ao fazer login:", error);
  }
}

// 3. Criar ou Obter Conversa
async function createOrGetConversation(participantId) {
  try {
    const response = await fetch(`${BASE_URL}/conversations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({ participantId })
    });
    const data = await response.json();
    console.log("Conversa:", data);
    return data;
  } catch (error) {
    console.error("Erro ao criar/obter conversa:", error);
  }
}

// 4. Listar Conversas de um Usuário
async function getUserConversations(userId) {
  try {
    const response = await fetch(`${BASE_URL}/conversations/${userId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${authToken}`
      }
    });
    const data = await response.json();
    console.log("Minhas Conversas:", data);
    return data;
  } catch (error) {
    console.error("Erro ao listar conversas:", error);
  }
}

// 5. Enviar Mensagem (Texto)
async function sendMessageText(conversationId, text) {
  try {
    const response = await fetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({ conversationId, text })
    });
    const data = await response.json();
    console.log("Mensagem de Texto Enviada:", data);
    return data;
  } catch (error) {
    console.error("Erro ao enviar mensagem de texto:", error);
  }
}

// 6. Upload de Mídia
async function uploadMedia(file) {
  try {
    const formData = new FormData();
    formData.append('media', file);

    const response = await fetch(`${BASE_URL}/media/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });
    const data = await response.json();
    console.log('Upload de Mídia:', data);
    return data;
  } catch (error) {
    console.error('Erro ao fazer upload de mídia:', error);
  }
}

// 7. Enviar Mensagem (Mídia - Após upload)
async function sendMessageMedia(conversationId, mediaUrl, mediaType) {
  try {
    const response = await fetch(`${BASE_URL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`
      },
      body: JSON.stringify({ conversationId, mediaUrl, mediaType })
    });
    const data = await response.json();
    console.log("Mensagem de Mídia Enviada:", data);
    return data;
  } catch (error) {
    console.error("Erro ao enviar mensagem de mídia:", error);
  }
}

// 8. Listar Mensagens de uma Conversa
async function getConversationMessages(conversationId) {
  try {
    const response = await fetch(`${BASE_URL}/messages/${conversationId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${authToken}`
      }
    });
    const data = await response.json();
    console.log("Mensagens da Conversa:", data);
    return data;
  } catch (error) {
    console.error("Erro ao listar mensagens:", error);
  }
}

// Exemplo de uso (descomente para testar)
/*
(async () => {
  // Primeiro, registre e faça login com dois usuários diferentes para testar
  // Usuário A
  await registerUser("usera", "Usuário A", "senha123");
  await loginUser("usera", "senha123");
  const userAId = "ID_DO_USUARIO_A_AQUI"; // Substitua pelo ID real do usuário A

  // Usuário B (em outro contexto ou navegador)
  // await registerUser("userb", "Usuário B", "senha123");
  // await loginUser("userb", "senha123");
  const userBId = "ID_DO_USUARIO_B_AQUI"; // Substitua pelo ID real do usuário B

  // Com o token do Usuário A
  const conversation = await createOrGetConversation(userBId);
  const conversationId = conversation._id;

  await sendMessageText(conversationId, "Olá Usuário B, tudo bem?");

  // Exemplo de envio de imagem
  // const imageFile = new File([""], "test_image.png", { type: "image/png" }); // Simule um arquivo
  // const uploadResultImage = await uploadMedia(imageFile);
  // if (uploadResultImage && uploadResultImage.mediaUrl) {
  //   await sendMessageMedia(conversationId, uploadResultImage.mediaUrl, uploadResultImage.mediaType);
  // }

  // Exemplo de envio de PDF
  // const pdfFile = new File([""], "test_document.pdf", { type: "application/pdf" }); // Simule um arquivo
  // const uploadResultPdf = await uploadMedia(pdfFile);
  // if (uploadResultPdf && uploadResultPdf.mediaUrl) {
  //   await sendMessageMedia(conversationId, uploadResultPdf.mediaUrl, uploadResultPdf.mediaType);
  // }

  await getUserConversations(userAId);
  await getConversationMessages(conversationId);

  // Para testar o WebSocket, você precisaria de um cliente Socket.IO separado
})();
*/
```

## 8. Exemplo de Integração Frontend Simples (HTML/JavaScript)

Este é um exemplo básico de como um frontend pode interagir com a API REST e o WebSocket, agora com a capacidade de exibir mídias. Para um ambiente de desenvolvimento, você precisaria de um servidor HTTP simples para servir este arquivo HTML.

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat Frontend Simples</title>
    <script src="https://cdn.socket.io/4.0.0/socket.io.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        #chat-window { border: 1px solid #ccc; height: 300px; overflow-y: scroll; padding: 10px; margin-bottom: 10px; }
        #message-input { width: calc(100% - 80px); padding: 8px; }
        #send-button { width: 70px; padding: 8px; }
        .message { margin-bottom: 5px; }
        .my-message { text-align: right; color: blue; }
        .other-message { text-align: left; color: green; }
        .message-media { max-width: 150px; max-height: 150px; border-radius: 5px; margin-top: 5px; }
        .message-file-link { display: block; margin-top: 5px; padding: 8px; background-color: #f0f0f0; border-radius: 5px; text-decoration: none; color: #333; }
    </style>
</head>
<body>
    <h1>Chat Simples</h1>

    <div>
        <h2>Autenticação</h2>
        <input type="text" id="loginUsername" placeholder="Username">
        <input type="password" id="loginPassword" placeholder="Password">
        <button id="loginButton">Login</button>
        <p id="authStatus"></p>
    </div>

    <hr>

    <div>
        <h2>Minhas Conversas</h2>
        <ul id="conversationList"></ul>
        <p>Usuário logado ID: <span id="currentUserId"></span></p>
        <p>Token JWT: <span id="jwtToken"></span></p>
    </div>

    <hr>

    <div>
        <h2>Chat</h2>
        <p>Conversa Atual ID: <span id="currentConversationId"></span></p>
        <div id="chat-window"></div>
        <input type="text" id="message-input" placeholder="Digite sua mensagem...">
        <button id="send-button">Enviar</button>
        <input type="file" id="media-upload" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt">
        <button id="send-media-button">Enviar Mídia</button>
    </div>

    <script>
        const BASE_URL = "http://localhost:3000/api";
        const SOCKET_URL = "http://localhost:3000";
        let authToken = "";
        let currentUserId = "";
        let currentConversationId = "";
        let socket = null;

        const authStatus = document.getElementById("authStatus");
        const currentUserIdSpan = document.getElementById("currentUserId");
        const jwtTokenSpan = document.getElementById("jwtToken");
        const conversationList = document.getElementById("conversationList");
        const currentConversationIdSpan = document.getElementById("currentConversationId");
        const chatWindow = document.getElementById("chat-window");
        const messageInput = document.getElementById("message-input");
        const sendButton = document.getElementById("send-button");
        const mediaUploadInput = document.getElementById("media-upload");
        const sendMediaButton = document.getElementById("send-media-button");

        document.getElementById("loginButton").addEventListener("click", async () => {
            const username = document.getElementById("loginUsername").value;
            const password = document.getElementById("loginPassword").value;
            const response = await fetch(`${BASE_URL}/users/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();
            if (response.ok) {
                authToken = data.token;
                currentUserId = data._id;
                authStatus.textContent = `Logado como: ${data.nome}`;
                currentUserIdSpan.textContent = currentUserId;
                jwtTokenSpan.textContent = authToken;
                connectSocket(currentUserId);
                loadConversations(currentUserId);
            } else {
                authStatus.textContent = `Erro: ${data.message}`;
            }
        });

        sendButton.addEventListener("click", () => {
            const text = messageInput.value;
            if (text.trim() && currentConversationId && currentUserId && socket) {
                // Em um app real, você obteria o receiverId da conversa ativa.
                // Para este exemplo, vamos apenas emitir a mensagem e o backend cuidará do resto.
                socket.emit("send_message", {
                    conversationId: currentConversationId,
                    senderId: currentUserId,
                    text: text,
                    receiverId: "ID_DO_OUTRO_USUARIO_NA_CONVERSA" // Substitua pelo ID real do outro usuário
                });
                messageInput.value = "";
            }
        });

        sendMediaButton.addEventListener("click", async () => {
            const file = mediaUploadInput.files[0];
            if (!file || !currentConversationId || !currentUserId || !socket) return;

            // 1. Fazer upload do arquivo para o backend
            const uploadResult = await uploadMedia(file);

            if (uploadResult && uploadResult.mediaUrl) {
                // 2. Enviar a mensagem com a URL da mídia via Socket.IO
                socket.emit("send_message", {
                    conversationId: currentConversationId,
                    senderId: currentUserId,
                    mediaUrl: uploadResult.mediaUrl,
                    mediaType: uploadResult.mediaType,
                    receiverId: "ID_DO_OUTRO_USUARIO_NA_CONVERSA" // Substitua pelo ID real do outro usuário
                });
                mediaUploadInput.value = ""; // Limpar o input de arquivo
            } else {
                console.error("Falha no upload da mídia.");
            }
        });

        async function uploadMedia(file) {
            const formData = new FormData();
            formData.append('media', file);

            try {
                const response = await fetch(`${BASE_URL}/media/upload`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: formData
                });
                return await response.json();
            } catch (error) {
                console.error('Erro ao fazer upload de mídia:', error);
                return null;
            }
        }

        function connectSocket(userId) {
            if (socket) socket.disconnect();
            socket = io(SOCKET_URL);

            socket.on("connect", () => {
                console.log("Conectado ao WebSocket:", socket.id);
                socket.emit("connect_user", userId);
            });

            socket.on("receive_message", (message) => {
                console.log("Mensagem recebida via WebSocket:", message);
                displayMessage(message);
            });

            socket.on("disconnect", () => {
                console.log("Desconectado do WebSocket");
            });
        }

        async function loadConversations(userId) {
            conversationList.innerHTML = "";
            const response = await fetch(`${BASE_URL}/conversations/${userId}`, {
                headers: { "Authorization": `Bearer ${authToken}` }
            });
            const conversations = await response.json();
            conversations.forEach(conv => {
                const li = document.createElement("li");
                const otherParticipant = conv.participants.find(p => p._id !== userId);
                li.textContent = `Conversa com: ${otherParticipant ? otherParticipant.nome : "Desconhecido"} (ID: ${conv._id})`;
                li.style.cursor = "pointer";
                li.addEventListener("click", () => {
                    currentConversationId = conv._id;
                    currentConversationIdSpan.textContent = currentConversationId;
                    loadMessages(currentConversationId);
                });
                conversationList.appendChild(li);
            });
        }

        async function loadMessages(conversationId) {
            chatWindow.innerHTML = "";
            const response = await fetch(`${BASE_URL}/messages/${conversationId}`, {
                headers: { "Authorization": `Bearer ${authToken}` }
            });
            const messages = await response.json();
            messages.forEach(msg => displayMessage(msg));
            chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll para o final
        }

        function displayMessage(message) {
            const div = document.createElement("div");
            div.classList.add("message");
            div.classList.add(message.senderId === currentUserId ? "my-message" : "other-message");

            let content = ``;
            if (message.text) {
                content += message.text;
            }
            if (message.mediaUrl && message.mediaType) {
                if (message.mediaType === "image") {
                    content += `<br><img src="${message.mediaUrl}" class="message-media" alt="Imagem">`;
                } else if (message.mediaType === "video") {
                    content += `<br><video src="${message.mediaUrl}" class="message-media" controls></video>`;
                } else if (message.mediaType === "audio") {
                    content += `<br><audio src="${message.mediaUrl}" controls></audio>`;
                } else {
                    // Para documentos e outros arquivos
                    const fileName = message.mediaUrl.substring(message.mediaUrl.lastIndexOf('/') + 1);
                    content += `<br><a href="${message.mediaUrl}" target="_blank" class="message-file-link">Arquivo: ${fileName} (${message.mediaType})</a>`;
                }
            }
            div.innerHTML = `${message.senderId.nome || message.senderId.username || message.senderId}: ${content} (${new Date(message.createdAt).toLocaleTimeString()})`;
            chatWindow.appendChild(div);
            chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll para o final
        }

        // Para criar uma nova conversa (exemplo, você precisaria de um input para o ID do participante)
        // async function createNewConversation(participantId) {
        //     const conv = await createOrGetConversation(participantId);
        //     if (conv) {
        //         loadConversations(currentUserId);
        //     }
        // }

        // Exemplo de como criar um usuário (para testes)
        // registerUser("testuser1", "Test User One", "password123");
        // registerUser("testuser2", "Test User Two", "password123");

    </script>
</body>
</html>
```

## 9. Escalabilidade e Evolução Futura

A arquitetura atual foi projetada com a escalabilidade em mente:

- **Modularização:** O código é dividido em módulos (models, controllers, routes, sockets), facilitando a manutenção e a adição de novas funcionalidades.
- **MongoDB:** Um banco de dados NoSQL flexível que se adapta bem a grandes volumes de dados e esquemas dinâmicos, ideal para mensagens e conversas.
- **Socket.IO:** Permite comunicação em tempo real eficiente, e pode ser configurado com adaptadores para escalar horizontalmente (ex: Redis Adapter) para múltiplos servidores.
- **Autenticação JWT:** Um padrão robusto e sem estado que não exige sessões no servidor, facilitando a escalabilidade.

### 9.1. Suporte a Grupos

Para adicionar suporte a grupos, seria necessário:

- **Modelo `Group`:** Um novo modelo para representar grupos, incluindo `name`, `description`, `members` (array de `userIds`), `admin`.
- **Atualização do `Conversation`:** O modelo `Conversation` poderia ser estendido para incluir um campo `type` (e.g., `private`, `group`) e referenciar o `Group` correspondente.
- **Rotas e Controllers:** Novos endpoints para criar grupos, adicionar/remover membros, listar mensagens de grupo.
- **Socket.IO:** A lógica de `chatSocket` precisaria ser adaptada para emitir mensagens para todos os membros de um grupo.

### 9.2. Envio de Mídia (Universal)

Para permitir o envio de imagens, vídeos, áudios, PDFs e outros arquivos:

- **Armazenamento de Arquivos:** Integrar com serviços de armazenamento em nuvem como AWS S3, Google Cloud Storage ou um servidor de arquivos dedicado. O novo endpoint REST `POST /api/media/upload` lida com o upload do arquivo, que retorna a URL para ser incluída na mensagem.
- **Atualização do `Message`:** Adicionamos campos ao modelo `Message` para `mediaUrl` e `mediaType`, que agora suporta `image`, `video`, `audio`, `document` e `file`.
- **Rotas e Controllers:** Implementamos o `mediaController.js` e `mediaRoutes.js` para gerenciar o upload de arquivos.

### 9.3. Notificações

Para notificações (push notifications, in-app notifications):

- **Serviços de Notificação:** Integrar com serviços como Firebase Cloud Messaging (FCM) para push notifications.
- **Modelo `Notification`:** Um novo modelo para armazenar notificações, incluindo `userId`, `type`, `message`, `read`.
- **Socket.IO:** Usar o Socket.IO para enviar notificações em tempo real para usuários online.

### 9.4. Microserviços

Para uma escalabilidade ainda maior, a API pode ser decomposta em microserviços:

- **Serviço de Autenticação:** Gerenciaria apenas o registro, login e validação de tokens.
- **Serviço de Usuários:** Gerenciaria perfis de usuários.
- **Serviço de Conversas:** Gerenciaria a criação e listagem de conversas.
- **Serviço de Mensagens:** Gerenciaria o envio e a recuperação de mensagens.
- **Serviço de Notificações:** Gerenciaria o envio de notificações.

Cada microserviço se comunicaria via APIs internas (REST, gRPC) ou filas de mensagens (Kafka, RabbitMQ).

## 10. Qualidade do Código

O código foi desenvolvido seguindo as seguintes práticas:

- **Código Limpo e Modular:** Separação de responsabilidades em `models`, `controllers`, `routes`, `sockets`, `config` e `middlewares`.
- **Comentários Explicativos:** Comentários foram adicionados para explicar a lógica complexa e a finalidade de cada seção.
- **Boas Práticas de Arquitetura Backend:** Uso de padrões como MVC (Model-View-Controller adaptado para API), autenticação baseada em token, validação de entrada e tratamento de erros.
- **Tratamento de Erros:** Captura de erros em controllers e middlewares para retornar respostas padronizadas ao cliente.

---

**Autor:** Manus AI
**Data:** 14 de Março de 2026
