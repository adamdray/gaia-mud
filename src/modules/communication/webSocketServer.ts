import WebSocket, { WebSocketServer as WSS } from 'ws'; // Renamed to avoid conflict
import { logger } from '@/utils/logger';
import { InputParser, CommandContextSession } from '@/modules/inputParser'; // Assuming parser handles raw input

export function initializeWebSocketServer(port: number): WSS { // Return type WSS
    const wss = new WSS({ port });

    wss.on('connection', (ws: WebSocket) => {
        // TODO: Implement proper session management
        // const session = PlayerSessionManager.createSession(ws, 'websocket');
        // logger.info(`Web client connected: ${session.id}`);
        logger.info('Web client connected (WebSocket)');


        ws.on('message', (message: Buffer | string) => { // message can be Buffer
            const messageStr = message.toString();
            logger.debug(`Received WebSocket message: ${messageStr}`);
            // Create a basic session context for the parser
            const sessionContext: CommandContextSession = {
                send: (msg: string) => ws.send(msg), // Function to send reply
                sourceType: 'websocket',
                // TODO: Add accountId, characterId after authentication
            };
            InputParser.parse(messageStr, sessionContext);
            // ws.send(`Server received (WS): ${messageStr}`); // Echo now handled by command execution
        });

        ws.on('close', () => {
            // logger.info(`Web client disconnected: ${session.id}`);
            // PlayerSessionManager.removeSession(session.id);
            logger.info('Web client disconnected (WebSocket)');
        });

        ws.on('error', (error) => {
            // logger.error(`WebSocket error for session ${session.id}:`, error);
            logger.error('WebSocket error:', error);
        });

        ws.send('Welcome to GAIA MUD via WebSocket!'); // Initial welcome
    });

    logger.info(`WebSocket server listening on port ${port}`);
    return wss;
}
