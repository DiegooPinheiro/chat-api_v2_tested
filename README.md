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

### Instalação e Servidor de Dev:
O projeto usa `pnpm`, mas tolera `npm`.

1. `npm install`
2. `npm run dev` (Inicia Nodemon monitorando modificações. Socket.io sobe junto na Porta Principal 3000 atrelado ao app Server HTTP nativo).

---
*Fim da documentação unificada backend. Atividade Vibe Chat.*
