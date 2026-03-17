const request = require('supertest');
const app = require('./src/app');
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Conversation = require('./src/models/Conversation');
const Message = require('./src/models/Message');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = 'test_secret_key_123';

// Configuração para teste local (Mock MongoDB ou conexão de teste)
// No sandbox, usaremos uma URI de teste se disponível, ou mockaremos a conexão
const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chat_test';

async function runTests() {
  console.log('--- Iniciando Testes de API REST (MOCKED DB) ---');

  try {
    // Mockar as funções do Mongoose para os testes
    mongoose.connect = () => Promise.resolve();
    User.deleteMany = () => Promise.resolve();
    Conversation.deleteMany = () => Promise.resolve();
    Message.deleteMany = () => Promise.resolve();

    // Mockar os métodos de salvamento e busca
    User.prototype.save = function() {
      this._id = new mongoose.Types.ObjectId();
      this.token = 'mock_token';
      return Promise.resolve(this);
    };
    let findOneCount = 0;
    User.findOne = (query) => {
      findOneCount++;
      const id = new mongoose.Types.ObjectId();
      const mockUser = {
        _id: id,
        ...query,
        nome: 'Usuário Teste',
        password: 'hashed_password',
        matchPassword: () => Promise.resolve(true),
        toObject: function() { return { _id: this._id, username: this.username, nome: this.nome }; }
      };

      const result = {
        select: function() { return Promise.resolve(mockUser); },
        then: function(resolve) {
          if (findOneCount <= 2) resolve(null);
          else resolve(mockUser);
        }
      };
      
      return result;
    };
    User.findById = (id) => ({
      select: function() { return Promise.resolve({ _id: id, nome: 'Usuário Teste' }); }
    });

    Conversation.findOne = () => Promise.resolve(null);
    Conversation.prototype.save = function() {
      this._id = new mongoose.Types.ObjectId();
      return Promise.resolve(this);
    };
    Conversation.findById = (id) => {
      const p1 = new mongoose.Types.ObjectId();
      const p2 = new mongoose.Types.ObjectId();
      return Promise.resolve({
        _id: id,
        participants: [p1, p2],
        // Mockar o includes para sempre retornar true para o sender nos testes
        participants: { includes: () => true }
      });
    };
    Conversation.findByIdAndUpdate = () => Promise.resolve();

    Message.prototype.save = function() {
      this._id = new mongoose.Types.ObjectId();
      this.createdAt = new Date();
      return Promise.resolve(this);
    };
    Message.find = () => ({
      sort: () => ({
        populate: () => Promise.resolve([
          { _id: '1', text: 'Msg 1', senderId: { nome: 'A' } },
          { _id: '2', text: 'Msg 2', senderId: { nome: 'B' } }
        ])
      })
    });

    // Mockar as classes para evitar o buffering do Mongoose
    User.create = (data) => Promise.resolve({ _id: new mongoose.Types.ObjectId(), ...data, token: 'mock_token' });
    Conversation.create = (data) => Promise.resolve({ _id: new mongoose.Types.ObjectId(), ...data });
    Message.create = (data) => Promise.resolve({ _id: new mongoose.Types.ObjectId(), ...data, createdAt: new Date() });

    console.log('Mocks do Mongoose configurados.');

    let userAToken, userBToken, userAId, userBId, conversationId;

    // 2. Testar Registro de Usuários
    console.log('\n[Teste 1] Registro de Usuários...');
    const resRegA = await request(app)
      .post('/api/users')
      .send({ username: 'user_a', nome: 'Usuário A', password: 'password123' });
    
    const resRegB = await request(app)
      .post('/api/users')
      .send({ username: 'user_b', nome: 'Usuário B', password: 'password123' });

    if (resRegA.status === 201 && resRegB.status === 201) {
      userAId = resRegA.body._id;
      userBId = resRegB.body._id;
      userAToken = resRegA.body.token;
      userBToken = resRegB.body.token;
      console.log('✅ Registro concluído com sucesso.');
    } else {
      throw new Error('Falha no registro: ' + JSON.stringify(resRegA.body));
    }

    // 3. Testar Login
    console.log('\n[Teste 2] Login de Usuário...');
    const resLogin = await request(app)
      .post('/api/users/login')
      .send({ username: 'user_a', password: 'password123' });
    
    if (resLogin.status === 200 && resLogin.body.token) {
      console.log('✅ Login concluído com sucesso.');
    } else {
      console.log('Status Login:', resLogin.status);
      console.log('Body Login:', resLogin.body);
      throw new Error('Falha no login.');
    }

    // 4. Testar Criação de Conversa
    console.log('\n[Teste 3] Criação de Conversa...');
    const resConv = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ participantId: userBId });
    
    if (resConv.status === 201 || resConv.status === 200) {
      conversationId = resConv.body._id;
      console.log('✅ Conversa criada/recuperada com sucesso. ID:', conversationId);
    } else {
      throw new Error('Falha ao criar conversa: ' + JSON.stringify(resConv.body));
    }

    // 5. Testar Envio de Mensagem de Texto
    console.log('\n[Teste 4] Envio de Mensagem de Texto...');
    const resMsgText = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ conversationId, text: 'Olá, esta é uma mensagem de teste!' });
    
    if (resMsgText.status === 201) {
      console.log('✅ Mensagem de texto enviada com sucesso.');
    } else {
      throw new Error('Falha ao enviar mensagem de texto.');
    }

    // 6. Testar Upload de Mídia (Simulado)
    console.log('\n[Teste 5] Upload de Mídia (Simulado)...');
    // Criar um arquivo temporário para teste
    const testFilePath = path.join(__dirname, 'test_file.pdf');
    fs.writeFileSync(testFilePath, 'Conteúdo de teste do PDF');

    const resUpload = await request(app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${userAToken}`)
      .attach('media', testFilePath);
    
    let mediaUrl, mediaType;
    if (resUpload.status === 200) {
      mediaUrl = resUpload.body.mediaUrl;
      mediaType = resUpload.body.mediaType;
      console.log('✅ Upload de mídia concluído. Tipo:', mediaType);
    } else {
      throw new Error('Falha no upload de mídia: ' + JSON.stringify(resUpload.body));
    }

    // 7. Testar Envio de Mensagem com Mídia (PDF)
    console.log('\n[Teste 6] Envio de Mensagem com Mídia (PDF)...');
    const resMsgMedia = await request(app)
      .post('/api/messages')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ conversationId, mediaUrl, mediaType, text: 'Segue o relatório em PDF.' });
    
    if (resMsgMedia.status === 201) {
      console.log('✅ Mensagem com mídia (PDF) enviada com sucesso.');
    } else {
      throw new Error('Falha ao enviar mensagem com mídia.');
    }

    // 8. Testar Listagem de Mensagens
    console.log('\n[Teste 7] Listagem de Mensagens...');
    const resListMsg = await request(app)
      .get(`/api/messages/${conversationId}`)
      .set('Authorization', `Bearer ${userAToken}`);
    
    if (resListMsg.status === 200 && resListMsg.body.length >= 2) {
      console.log(`✅ Listagem concluída. Total de mensagens: ${resListMsg.body.length}`);
    } else {
      throw new Error('Falha na listagem de mensagens.');
    }

    console.log('\n--- Todos os Testes de API REST passaram com sucesso! ---');
    
    // Limpeza final
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERRO NOS TESTES:', error.message);
    process.exit(1);
  }
}

runTests();
