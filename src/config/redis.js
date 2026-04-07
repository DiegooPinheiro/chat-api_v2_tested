const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://default:0kUdMcYppetyVad0ydBVrqH8TH3JT4AW@redis-14257.crce278.sa-east-1-2.ec2.cloud.redislabs.com:14257';

const redisClient = createClient({
  url: REDIS_URL
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log('Redis conectado com sucesso!');
  } catch (error) {
    console.error('Falha ao conectar no Redis:', error);
  }
};

module.exports = { redisClient, connectRedis };
