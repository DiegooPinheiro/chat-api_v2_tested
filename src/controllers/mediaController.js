const path = require('path');

// @desc    Upload de arquivo de mídia
// @route   POST /api/media/upload
// @access  Private
const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Nenhum arquivo enviado' });
    }

    // Determinar o tipo de mídia baseado na extensão ou mimetype
    const ext = path.extname(req.file.originalname).toLowerCase();
    let mediaType = 'file';

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      mediaType = 'image';
    } else if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) {
      mediaType = 'video';
    } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
      mediaType = 'audio';
    } else if (['.pdf', '.doc', '.docx', '.pdf', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'].includes(ext)) {
      mediaType = 'document';
    }

    // Em um cenário de produção real, aqui você faria o upload para o S3/Cloudinary.
    // Para este exemplo, retornamos o caminho local simulado ou o nome do arquivo.
    // IMPORTANTE: Em produção, substitua isso pela URL pública do seu storage.
    const mediaUrl = `/uploads/${req.file.filename}`;

    res.status(200).json({
      message: 'Upload realizado com sucesso',
      mediaUrl,
      mediaType,
      fileName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    res.status(500).json({ message: 'Erro no upload: ' + error.message });
  }
};

module.exports = {
  uploadMedia
};
