import net from 'net';
// import tls from 'tls'; // For secure Telnet
// import fs from 'fs';
import { logger } from '@/utils/logger';
import { InputParser } from '../inputParser';
// import { PlayerSessionManager, PlayerSession } from '@/core/sessions';

export function initializeTelnetServer(port: number): net.Server {
    // For TLS, you'll need to generate a key and certificate
    // const options = {
    //   key: fs.readFileSync('path/to/server-key.pem'),
    //   cert: fs.readFileSync('path/to/server-cert.pem'),
    // };
    // const server = tls.createServer(options, (socket) => { ... });

    const server = net.createServer((socket) => {
        // const session = PlayerSessionManager.createSession(socket, 'telnet');
        // logger.info(`Telnet client connected: ${session.id} from ${socket.remoteAddress}:${socket.remotePort}`);
        logger.info(`Telnet client connected from ${socket.remoteAddress}:${socket.remotePort}`);

        socket.write('Welcome to GAIA MUD via Telnet!\r\n');
        socket.write('Please use "connect <user> <password>" to login.\r\n');

        socket.on('data', (data: Buffer) => {
            const message = data.toString().trim();
            if (message) { // Avoid processing empty messages
                logger.debug(`Received Telnet message: ${message}`);
                // InputParser.parse(message, session);
                socket.write(`Server received: ${message}\r\n`); // Echo for now
            }
        });

        socket.on('end', () => {
            // logger.info(`Telnet client disconnected: ${session.id}`);
            // PlayerSessionManager.removeSession(session.id);
            logger.info('Telnet client disconnected');
        });

        socket.on('error', (err) => {
            // logger.error(`Telnet socket error for session ${session.id}:`, err);
            logger.error('Telnet socket error:', err);
            // PlayerSessionManager.removeSession(session.id); // Ensure cleanup on error
            socket.destroy(); // Close the socket on error
        });
    });

    server.listen(port, () => {
        logger.info(`Telnet server listening on port ${port}`);
    });
    return server;
}
