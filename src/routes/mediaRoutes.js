const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadMedia } = require('../controllers/mediaController');
const { protect } = require('../middlewares/auth');

// Garantir que a pasta de uploads existe (apenas para este exemplo local)
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Configuração do Multer para armazenamento local
// Em produção, você usaria o multer-s3 ou enviaria direto para o storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // Limite de 50MB
  },
  fileFilter: (req, file, cb) => {
    // Aqui você pode restringir os tipos de arquivo permitidos
    // Por enquanto, aceitaremos todos os tipos comuns para uma rede social completa
    cb(null, true);
  }
});

router.post('/upload', protect, upload.single('media'), uploadMedia);

module.exports = router;
