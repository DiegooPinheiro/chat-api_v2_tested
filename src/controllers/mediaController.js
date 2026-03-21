const path = require('path');

const uploadMedia = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(404).json({ message: 'Usuario ainda nao sincronizado na Chat API' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Nenhum arquivo enviado' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let mediaType = 'file';

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
      mediaType = 'image';
    } else if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) {
      mediaType = 'video';
    } else if (['.mp3', '.wav', '.ogg', '.m4a'].includes(ext)) {
      mediaType = 'audio';
    } else if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'].includes(ext)) {
      mediaType = 'document';
    }

    const mediaUrl = `/uploads/${req.file.filename}`;

    return res.status(200).json({
      message: 'Upload realizado com sucesso',
      mediaUrl,
      mediaType,
      fileName: req.file.originalname,
      size: req.file.size,
    });
  } catch (error) {
    return res.status(500).json({ message: `Erro no upload: ${error.message}` });
  }
};

module.exports = {
  uploadMedia,
};
