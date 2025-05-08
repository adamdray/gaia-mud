import WebSocket, { WebSocketServer as WSS } from 'ws'; // Renamed WebSocketServer to WSS to avoid conflict
import { logger } from '@/utils/logger';
import { InputParser } from '../inputParser';
// import { PlayerSessionManager, PlayerSession } from '@/core/sessions'; // Define PlayerSession type

export function initializeWebSocketServer(port: number): WSS { // Changed return type
    const wss = new WSS({ port });

    wss.on('connection', (ws: WebSocket) => {
        // const session = PlayerSessionManager.createSession(ws, 'websocket');
        // logger.info(`Web client connected: ${session.id}`);
        logger.info('Web client connected');


        ws.on('message', (message: Buffer | string) => { // message can be Buffer
            const messageStr = message.toString();
            logger.debug(`Received WebSocket message: ${messageStr}`);
            // InputParser.parse(messageStr, session);
            ws.send(`Server received: ${messageStr}`); // Echo for now
        });

        ws.on('close', () => {
            // logger.info(`Web client disconnected: ${session.id}`);
            // PlayerSessionManager.removeSession(session.id);
            logger.info('Web client disconnected');
        });

        ws.on('error', (error) => {
            // logger.error(`WebSocket error for session ${session.id}:`, error);
            logger.error('WebSocket error:', error);
        });

        ws.send('Welcome to GAIA MUD via WebSocket!');
    });

    logger.info(`WebSocket server listening on port ${port}`);
    return wss;
}
