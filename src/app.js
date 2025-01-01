// Importa las dependencias necesarias
const TelegramBot = require('node-telegram-bot-api'); // Librería para el bot de Telegram
const axios = require('axios'); // Cliente HTTP para hacer peticiones
const fs = require('fs'); 
const path = require('path');
// const morgan = require('morgan'); // Middelware para logs
require('dotenv').config(); // Carga las variables de entorno
const { sendToOpenAIAssistant, transcribeAudio, sendToverificador } = require('./openai'); // Importa la función sendToOpenAIAssistant

// Configura tu token de Telegram Bot y API de OpenAI
const BOT_TOKEN = process.env.BOT_TOKEN_REST;
// const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
// const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;

// Funcion principal para procesar los mensajes
async function processRequest(userId, userMessage) { 
    try {
        const assistantResponse = await sendToOpenAIAssistant(userId, userMessage);
        const output = await sendToverificador(assistantResponse);
        // const output = assistantResponse
        return output;
    } catch (error) {
        console.error('Error al enviar mensaje al asistente de OpenAI:', error);
        return 'Hubo un error al procesar tu solicitud.';
    }
}

// Escucha los mensajes entrantes
bot.on('message', async (msg) => {
    const chatId = msg.chat.id; // Guarda el ID del chat
    console.log(`ID del chat: ${chatId}`);

    // Si hay un mensaje valido
    if (msg.text || msg.voice) {
        // Si es texto
        if (msg.text) {
            const texto = msg.text;
            console.log(`Mensaje de texto recibido: ${texto}`);
            
            // Después de obtener la respuesta de OpenAI
            const openAIResponse = await processRequest(chatId, texto);            
            // Iteramos sobre cada clave del objeto y enviamos el mensaje correspondiente
            if (openAIResponse) {
                for (const parte in openAIResponse) {
                    if (openAIResponse.hasOwnProperty(parte)) {
                        const mensaje = openAIResponse[parte];
                        await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
                    }
                }
            } else {
                bot.sendMessage(chatId, 'No se pudo obtener una respuesta válida.');
            }
        
        // Si es un mensaje de voz
        } else if (msg.voice) {
            try {
                const fileId = msg.voice.file_id;
                const fileLink = await bot.getFileLink(fileId);

                // Descarga el archivo de audio
                const audioPath = path.resolve(__dirname, 'audio.ogg');
                const writer = fs.createWriteStream(audioPath);
                const response = await axios({
                    url: fileLink,
                    method: 'GET',
                    responseType: 'stream',
                });
                response.data.pipe(writer);

                writer.on('finish', async () => {
                    console.log('Audio descargado, enviando a Whisper...');
                    const transcribedText = await transcribeAudio(audioPath);
                    if (transcribedText) {
                        // Después de obtener la respuesta de OpenAI
                        const openAIResponse = await processRequest(chatId, transcribedText);
                        // Iteramos sobre cada clave del objeto y enviamos el mensaje correspondiente
                        if (openAIResponse) {
                            for (const parte in openAIResponse) {
                                if (openAIResponse.hasOwnProperty(parte)) {
                                    const mensaje = openAIResponse[parte];
                                    await bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
                                }
                            }
                        } else {
                            bot.sendMessage(chatId, 'No se pudo obtener una respuesta válida.');
                        }
                    } else {
                        bot.sendMessage(chatId, 'No se pudo transcribir el audio.');
                    }
                    fs.unlinkSync(audioPath); // Elimina el archivo temporal
                });
            } catch (error) {
                console.error('Error al manejar el mensaje de voz:', error);
                bot.sendMessage(chatId, 'Ocurrió un error al procesar el audio.');
            }
        }

    // Si NO hay un mensaje valido
    } else {
        bot.sendMessage(chatId, 'Formato no soportado. Envía texto o un mensaje de voz.');
    }
});
  

console.log('Bot de Telegram iniciado. Escuchando mensajes...');
