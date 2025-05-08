import net from 'net';
// import tls from 'tls'; // For secure Telnet
// import fs from 'fs';
import { logger } from '@/utils/logger';
import { InputParser, CommandContextSession } from '@/modules/inputParser';
// import { PlayerSessionManager, PlayerSession } from '@/core/sessions';

export function initializeTelnetServer(port: number): net.Server {
    // For TLS, you'll need to generate a key and certificate
    // const options = {
    //   key: fs.readFileSync('path/to/server-key.pem'),
    //   cert: fs.readFileSync('path/to/server-cert.pem'),
    // };
    // const server = tls.createServer(options, (socket) => { ... });

    const server = net.createServer((socket) => {
        const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
        // const session = PlayerSessionManager.createSession(socket, 'telnet');
        // logger.info(`Telnet client connected: ${session.id} from ${clientAddress}`);
        logger.info(`Telnet client connected from ${clientAddress}`);


        socket.write('Welcome to GAIA MUD via Telnet!\r\n');
        // Initial login prompt handled by InputParser based on spec (connect user pass)
        // socket.write('Please use "connect <user> <password>" to login.\r\n');

        socket.on('data', (data: Buffer) => {
            const message = data.toString().trim(); // Trim whitespace and newlines
            if (message) { // Avoid processing empty messages
                logger.debug(`Received Telnet message from ${clientAddress}: ${message}`);
                const sessionContext: CommandContextSession = {
                    send: (msg: string) => socket.write(msg + '\r\n'), // Telnet needs CRLF
                    sourceType: 'telnet',
                    // TODO: Add accountId, characterId after authentication
                };
                InputParser.parse(message, sessionContext);
                // socket.write(`Server received (Telnet): ${message}\r\n`); // Echo now handled by command execution
            }
        });

        socket.on('end', () => {
            // logger.info(`Telnet client disconnected: ${session.id}`);
            // PlayerSessionManager.removeSession(session.id);
            logger.info(`Telnet client disconnected: ${clientAddress}`);
        });

        socket.on('error', (err) => {
            // logger.error(`Telnet socket error for session ${session.id}:`, err);
            logger.error(`Telnet socket error for ${clientAddress}:`, err);
            // PlayerSessionManager.removeSession(session.id); // Ensure cleanup on error
            socket.destroy(); // Close the socket on error
        });
    });

    server.listen(port, () => {
        logger.info(`Telnet server listening on port ${port}`);
    });
    return server;
}
