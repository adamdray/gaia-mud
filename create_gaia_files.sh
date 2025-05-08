#!/bin/bash

# This script creates the directory structure and files for the GAIA MUD project
# based on the provided project shell.

echo "Creating GAIA MUD project files and directories..."

# Create root files
echo "Creating package.json..."
cat <<'EOF' > package.json
{
  "name": "gaia-mud",
  "version": "0.1.0",
  "description": "GAIA MUD Server",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "nodemon src/server.ts",
    "lint": "eslint . --ext .ts",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [
    "mud",
    "mush",
    "game",
    "server",
    "typescript",
    "nodejs"
  ],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "compromise": "^14.13.0",
    "nano": "^10.1.3",
    "dotenv": "^16.3.1",
    "ws": "^8.14.2"
  },
  "devDependencies": {
    "@types/node": "^20.8.9",
    "@types/ws": "^8.5.7",
    "@typescript-eslint/eslint-plugin": "^6.9.0",
    "@typescript-eslint/parser": "^6.9.0",
    "eslint": "^8.52.0",
    "nodemon": "^3.0.1",
    "ts-node": "^10.9.1",
    "typescript": "^5.2.2"
  }
}
EOF

echo "Creating tsconfig.json..."
cat <<'EOF' > tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "world_data", "g_modules"]
}
EOF

echo "Creating .env.example..."
cat <<'EOF' > .env.example
NODE_ENV=development
PORT=4000
TELNET_PORT=8888

# CouchDB Connection
COUCHDB_URL=http://admin:password@localhost:5984
COUCHDB_WORLD_DB=gaia_world
COUCHDB_ACCOUNTS_DB=gaia_accounts

# Logging Level (e.g., debug, info, warn, error)
LOG_LEVEL=debug
EOF
echo "Note: Remember to copy .env.example to .env and fill in your actual values."

# Create src directory and files
mkdir -p src/core
mkdir -p src/utils
mkdir -p src/modules/communication
mkdir -p src/modules/inputParser
mkdir -p src/modules/inputBinder
mkdir -p src/modules/database
mkdir -p src/modules/gLanguage
mkdir -p src/modules/gameEngine
mkdir -p src/modules/security
mkdir -p src/modules/world
mkdir -p src/modules/accounts

echo "Creating src/server.ts..."
mkdir -p "$(dirname "src/server.ts")"
cat <<'EOF' > src/server.ts
import dotenv from 'dotenv';
dotenv.config(); // Load environment variables from .env file

import { ConfigManager } from './config';
import { logger } from './utils/logger';
import { initializeWebSocketServer } from './modules/communication/webSocketServer';
import { initializeTelnetServer } from './modules/communication/telnetServer';
import { DatabaseManager } from './modules/database';
import { WorldManager } from './modules/world';
import { GEngine } from './modules/gLanguage';
import { AccountManager } from './modules/accounts';
import { SecurityManager } from './modules/security';
import { InputParser } from './modules/inputParser';
import { InputBinder } from './modules/inputBinder';
import { GameEngine } from './modules/gameEngine';

async function main() {
    logger.info('Starting GAIA MUD Server...');

    // 1. Initialize Configuration
    await ConfigManager.loadInitialConfig(); // Load from YAML
    await ConfigManager.loadGameConfig();   // Load #config object from DB

    // 2. Initialize Database
    await DatabaseManager.initialize();

    // 3. Initialize Core Game Systems
    await WorldManager.initialize();    // Load core objects, etc.
    await GEngine.initialize();         // Load G stdlib, etc.
    await AccountManager.initialize();
    await SecurityManager.initialize();
    InputParser.initialize();
    InputBinder.initialize();
    GameEngine.initialize();


    // 4. Start Communication Interfaces
    const webSocketPort = parseInt(process.env.PORT || '4000', 10);
    initializeWebSocketServer(webSocketPort);

    const telnetPort = parseInt(process.env.TELNET_PORT || '8888', 10);
    initializeTelnetServer(telnetPort);

    // 5. Execute #object.startup
    const startupObject = await WorldManager.getObjectById(ConfigManager.get('core.startupObjectId') || '#object');
    if (startupObject) {
        logger.info(`Executing startup sequence on object: ${startupObject.id}`);
        try {
            await GEngine.executeAttribute(startupObject, 'startup', [], { executor: startupObject, actor: startupObject /* more context needed */ });
            logger.info('Startup sequence completed.');
        } catch (error) {
            logger.error('Error during startup sequence:', error);
        }
    } else {
        logger.warn('Startup object not found. Skipping #object.startup execution.');
    }

    logger.info(`GAIA MUD Server is running. Web client on port ${webSocketPort}, Telnet on port ${telnetPort}.`);
}

main().catch(error => {
    logger.error('Fatal error during server startup:', error);
    process.exit(1);
});
EOF

echo "Creating src/config.ts..."
mkdir -p "$(dirname "src/config.ts")"
cat <<'EOF' > src/config.ts
import fs from 'fs/promises';
import path from 'path';
// import YAML from 'yaml'; // Or your preferred YAML/JSON5 parser - npm install yaml
import { logger } from './utils/logger';
import { DatabaseManager } from './modules/database'; // Assuming DB manager can fetch objects
import { GameObject } from './core/types';

interface ServerSettings {
    port: number;
    telnetPort: number;
    dbConnectionString: string;
    worldDbName: string;
    accountsDbName: string;
    logLevel: string;
    // Add other initial settings
}

interface GameConfig {
    [key: string]: any; // Attributes from #config object
}

export class ConfigManager {
    private static initialSettings: ServerSettings | null = null;
    private static gameConfig: GameConfig = {}; // In-game #config object

    public static async loadInitialConfig(filePath: string = 'server_config.yaml'): Promise<void> {
        try {
            const fullPath = path.resolve(process.cwd(), filePath);
            logger.info(`Loading initial server configuration from: ${fullPath}`);
            // const fileContents = await fs.readFile(fullPath, 'utf8');
            // this.initialSettings = YAML.parse(fileContents);
            // For now, using environment variables and defaults:
            this.initialSettings = {
                port: parseInt(process.env.PORT || '4000', 10),
                telnetPort: parseInt(process.env.TELNET_PORT || '8888', 10),
                dbConnectionString: process.env.COUCHDB_URL || 'http://admin:password@localhost:5984',
                worldDbName: process.env.COUCHDB_WORLD_DB || 'gaia_world',
                accountsDbName: process.env.COUCHDB_ACCOUNTS_DB || 'gaia_accounts',
                logLevel: process.env.LOG_LEVEL || 'debug',
            };
            logger.info('Initial server configuration loaded (from env/defaults).');
        } catch (error) {
            logger.error(`Failed to load initial configuration from ${filePath}:`, error);
            throw new Error(`Failed to load initial configuration: ${filePath}`);
        }
    }

    public static async loadGameConfig(configObjectId: string = '#config'): Promise<void> {
        logger.info(`Loading game configuration from object: ${configObjectId}`);
        try {
            const configObjectDoc = await DatabaseManager.getWorldDB().get(configObjectId);
            const configObject = configObjectDoc as unknown as GameObject; // Added type assertion

            if (configObject && configObject.attributes) {
                this.gameConfig = { ...configObject.attributes };
                logger.info('Game configuration loaded successfully from database.');
            } else {
                logger.warn(`Game configuration object "${configObjectId}" not found or has no attributes.`);
                this.gameConfig = {}; // Default to empty if not found
            }
        } catch (error: any) {
            if (error.statusCode === 404) {
                 logger.warn(`Game configuration object "${configObjectId}" not found. Using empty config.`);
                 this.gameConfig = {};
            } else {
                logger.error(`Failed to load game configuration from object "${configObjectId}":`, error);
            }
        }
    }

    public static getInitialSetting<K extends keyof ServerSettings>(key: K): ServerSettings[K] {
        if (!this.initialSettings) {
            throw new Error("Initial settings not loaded. Call loadInitialConfig first.");
        }
        return this.initialSettings[key];
    }

    public static get<T = any>(key: string, defaultValue?: T): T {
        const keys = key.split('.');
        let current: any = this.gameConfig;
        for (const k of keys) {
            if (current && typeof current === 'object' && k in current) {
                current = current[k];
            } else {
                return defaultValue as T;
            }
        }
        return current as T ?? defaultValue as T;
    }

    public static getAllGameConfig(): GameConfig {
        return { ...this.gameConfig };
    }
}
EOF

echo "Creating src/core/types.ts..."
mkdir -p "$(dirname "src/core/types.ts")"
cat <<'EOF' > src/core/types.ts
export type ObjectID = string; // e.g., "#some_id", "uuid-string"

export interface Attribute {
    // Define structure if attributes have metadata, or just use `any` for value
    value: any;
    // lastModified?: Date;
    // permissions?: string; // Example: for G attribute security
}

export interface GameObject {
    _id: ObjectID; // CouchDB uses _id
    _rev?: string;  // CouchDB uses _rev for document versioning
    id: ObjectID;   // Keep our own logical ID consistent if needed, or just use _id
    name?: string;
    description?: string;
    parentIds: ObjectID[]; // For multiple inheritance
    attributes: Record<string, Attribute | string | number | boolean | GValue | null >; // G code is stored in attributes
    locationId?: ObjectID;
    contentIds?: ObjectID[];
    ownerId?: ObjectID;
    createdAt: string; // ISO Date string
    updatedAt: string; // ISO Date string
}

export interface PlayerCharacter extends GameObject {
    accountId: string; // Link to the player account
}

export interface PlayerAccount {
    _id: string; // CouchDB uses _id (can be UUID)
    _rev?: string; // CouchDB uses _rev
    id: string;    // Keep our own logical ID consistent
    loginId: string;
    email: string;
    hashedPassword?: string;
    realName?: string;
    characterIds: ObjectID[];
    roles: string[];
    createdAt: string; // ISO Date string
    lastLoginAt?: string; // ISO Date string
}

// G Language specific types
export type GValue = string | number | boolean | GList | GMap | GameObject | null;
export type GList = GValue[];
export interface GMap { [key: string]: GValue; }

export interface GCommand {
    func: string;
    args: GValue[];
    raw?: string; // Original text of the command part
}

export interface GContext {
    executor: GameObject;
    actor: GameObject;
    thisObject?: GameObject;
    // currentCommand?: GCommand; // The command being executed
    // localVariables?: Record<string, GValue>;
    // depth?: number; // For recursion control
}
EOF

echo "Creating src/utils/logger.ts..."
mkdir -p "$(dirname "src/utils/logger.ts")"
cat <<'EOF' > src/utils/logger.ts
// Basic console logger, can be replaced with Winston, Pino, etc.
// Levels could be controlled by process.env.LOG_LEVEL or ConfigManager

const getLogLevel = () => process.env.LOG_LEVEL || 'debug';

const LOG_LEVELS: { [key: string]: number } = {
    'error': 0,
    'warn': 1,
    'info': 2,
    'debug': 3,
};

const currentLogLevelNumber = () => LOG_LEVELS[getLogLevel()] ?? LOG_LEVELS['debug'];

export const logger = {
    debug: (...args: any[]) => {
        if (currentLogLevelNumber() >= LOG_LEVELS['debug']) console.debug(`[${new Date().toISOString()}] [DEBUG]`, ...args);
    },
    info: (...args: any[]) => {
        if (currentLogLevelNumber() >= LOG_LEVELS['info']) console.info(`[${new Date().toISOString()}] [INFO]`, ...args);
    },
    warn: (...args: any[]) => {
        if (currentLogLevelNumber() >= LOG_LEVELS['warn']) console.warn(`[${new Date().toISOString()}] [WARN]`, ...args);
    },
    error: (...args: any[]) => {
        if (currentLogLevelNumber() >= LOG_LEVELS['error']) console.error(`[${new Date().toISOString()}] [ERROR]`, ...args);
    },
};
EOF

echo "Creating src/modules/communication/index.ts..."
mkdir -p "$(dirname "src/modules/communication/index.ts")"
cat <<'EOF' > src/modules/communication/index.ts
export * from './webSocketServer';
export * from './telnetServer';
EOF

echo "Creating src/modules/communication/webSocketServer.ts..."
mkdir -p "$(dirname "src/modules/communication/webSocketServer.ts")"
cat <<'EOF' > src/modules/communication/webSocketServer.ts
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
EOF

echo "Creating src/modules/communication/telnetServer.ts..."
mkdir -p "$(dirname "src/modules/communication/telnetServer.ts")"
cat <<'EOF' > src/modules/communication/telnetServer.ts
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
EOF

echo "Creating src/modules/inputParser/index.ts..."
mkdir -p "$(dirname "src/modules/inputParser/index.ts")"
cat <<'EOF' > src/modules/inputParser/index.ts
import compromise from 'compromise';
import { logger } from '@/utils/logger';
// import { PlayerSession } from '@/core/sessions'; // Define PlayerSession type
import { InputBinder } from '../inputBinder';
import { GCommand } from '@/core/types';

export class InputParser {
    public static initialize() {
        logger.info('Input Parser initialized.');
        // Load custom nouns, verbs, etc. if needed for compromise
        // Example:
        // const lexicon = { 'mycustomverb': 'Verb' };
        // compromise.plugin({ words: lexicon });
    }

    public static parse(rawInput: string, session: any /* PlayerSession */): void {
        // logger.debug(`Parsing input from ${session.id || 'unknown player'} (${session.sourceType}): "${rawInput}"`);
        logger.debug(`Parsing input: "${rawInput}"`);


        // 1. Pre-processing (lowercase, trim, etc.)
        const cleanedInput = rawInput.toLowerCase().trim();
        if (!cleanedInput) return; // Ignore empty input

        // 2. Use Compromise NLP for initial breakdown
        const doc = compromise(cleanedInput);

        // 3. Apply Bartle-like parsing logic (this will be complex)
        //    - Identify verb, direct object, indirect object, prepositions
        //    - Handle synonyms, disambiguation
        //    - This is where you'd implement the MUD2-style parsing rules.

        const verbs = doc.verbs().out('array');
        const nouns = doc.nouns().out('array');
        // This is a very basic extraction, needs significant improvement
        const verb = verbs.length > 0 ? verbs[0] : '';
        const directObject = nouns.length > 0 ? nouns[0] : ''; // Highly simplistic

        const parsedCommand: GCommand = {
            func: verb, // Or map to a command prefix like 'cmd_' + verb
            args: [directObject].filter(arg => arg), // Filter out empty args
            raw: cleanedInput,
        };
        logger.debug('Parsed command structure:', parsedCommand);

        // 4. Pass to InputBinder
        InputBinder.bindAndExecute(parsedCommand, session);
    }

    // Methods for dynamic addition of grammar via G
    public static addVerb(verb: string, synonyms: string[] = []): void {
        const lexicon: Record<string, string> = {};
        lexicon[verb.toLowerCase()] = 'Verb';
        synonyms.forEach(s => lexicon[s.toLowerCase()] = 'Verb');
        compromise.plugin({ words: lexicon });
        logger.info(`Added verb to parser: ${verb} (Synonyms: ${synonyms.join(', ')})`);
    }
    public static addNoun(noun: string, properties: any = {}): void {
        const lexicon: Record<string, string> = {};
        lexicon[noun.toLowerCase()] = 'Noun';
        // properties could be used to add more tags if compromise supports it easily
        compromise.plugin({ words: lexicon });
        logger.info(`Added noun to parser: ${noun}`);
    }
}
EOF

echo "Creating src/modules/inputBinder/index.ts..."
mkdir -p "$(dirname "src/modules/inputBinder/index.ts")"
cat <<'EOF' > src/modules/inputBinder/index.ts
import { logger } from '@/utils/logger';
import { GameObject, PlayerCharacter, GContext, GCommand } from '@/core/types';
import { WorldManager } from '../world';
import { GEngine } from '../gLanguage';
// import { PlayerSession } from '@/core/sessions';

export class InputBinder {
    public static initialize() {
        logger.info('Input Binder initialized.');
    }

    public static async bindAndExecute(parsedCommand: GCommand, session: any /* PlayerSession */): Promise<void> {
        // const actor = await WorldManager.getObjectById(session.characterId) as PlayerCharacter;
        // if (!actor) {
        //     logger.warn(`Actor not found for session: ${session.characterId}`);
        //     // session.send("You don't seem to be in the world.");
        //     return;
        // }
        const actor: GameObject = { id: "player1", _id: "player1", name: "Test Player", parentIds: [], attributes: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; // Placeholder

        const verb = parsedCommand.func;
        if (!verb) {
            // session.send("What do you want to do?");
            logger.warn("No verb in parsed command.");
            return;
        }

        // 1. Find the command object/attribute.
        //    This involves checking the actor, their location, global commands, etc.
        //    This uses the inheritance model. E.g., look for an attribute named `cmd_${verb}`.
        let commandHandlerObject: GameObject | null = null;
        let commandAttributeName: string | null = null;

        const commandAttrName = `cmd_${verb.toLowerCase()}`;

        // Search order (simplified for now):
        // - Actor's own attributes
        commandHandlerObject = actor; // Check self first
        if (await WorldManager.getAttributeValue(actor.id, commandAttrName)) {
            commandAttributeName = commandAttrName;
        } else {
            // - Actor's location attributes (if location exists)
            // if (actor.locationId) {
            //     const location = await WorldManager.getObjectById(actor.locationId);
            //     if (location && await WorldManager.getAttributeValue(location.id, commandAttrName)) {
            //         commandHandlerObject = location;
            //         commandAttributeName = commandAttrName;
            //     }
            // }
            // - Global command objects (TODO: define how these are identified)
        }


        logger.debug(`Binding command: "${verb}" for actor: ${actor.id}. Attempting attribute: ${commandAttributeName}`);

        if (commandHandlerObject && commandAttributeName) {
            const gContext: GContext = {
                executor: commandHandlerObject,
                actor: actor,
                // currentCommand: parsedCommand,
            };
            try {
                const result = await GEngine.executeAttribute(
                    commandHandlerObject,
                    commandAttributeName,
                    parsedCommand.args, // Pass all args from GCommand
                    gContext
                );
                logger.debug(`Command "${verb}" executed. Result: ${result}`);
                // session.send(result as string); // Or format result appropriately
            } catch (error) {
                logger.error(`Error executing command "${verb}" for actor ${actor.id}:`, error);
                // session.send("Something went wrong trying to do that.");
            }
        } else {
            logger.debug(`No command handler found for verb: ${verb}`);
            // session.send(`I don't understand how to "${verb}".`);
        }
    }
}
EOF

echo "Creating src/modules/database/index.ts..."
mkdir -p "$(dirname "src/modules/database/index.ts")"
cat <<'EOF' > src/modules/database/index.ts
import nano, { DocumentScope, ServerScope, DocumentGetResponse } from 'nano';
import { logger } from '@/utils/logger';
import { ConfigManager } from '@/config';
import { GameObject, PlayerAccount } from '@/core/types';

export class DatabaseManager {
    private static instance: ServerScope;
    private static worldDb: DocumentScope<unknown>; // Use unknown initially
    private static accountsDb: DocumentScope<unknown>; // Use unknown initially

    public static async initialize(): Promise<void> {
        const dbUrl = ConfigManager.getInitialSetting('dbConnectionString');
        const worldDbName = ConfigManager.getInitialSetting('worldDbName');
        const accountsDbName = ConfigManager.getInitialSetting('accountsDbName');

        if (!dbUrl || !worldDbName || !accountsDbName) {
            throw new Error('Database configuration is missing.');
        }

        logger.info(`Connecting to CouchDB at ${dbUrl}`);
        this.instance = nano(dbUrl);

        try {
            await this.instance.db.get(worldDbName);
            logger.info(`Found world database: ${worldDbName}`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`World database "${worldDbName}" not found. Attempting to create.`);
                await this.instance.db.create(worldDbName);
                logger.info(`World database "${worldDbName}" created.`);
                // Initialize views/indexes here if needed for GameObject
            } else {
                logger.error(`Error accessing world database ${worldDbName}:`, error);
                throw error;
            }
        }
        this.worldDb = this.instance.use(worldDbName);

        try {
            await this.instance.db.get(accountsDbName);
            logger.info(`Found accounts database: ${accountsDbName}`);
        } catch (error: any) {
            if (error.statusCode === 404) {
                logger.warn(`Accounts database "${accountsDbName}" not found. Attempting to create.`);
                await this.instance.db.create(accountsDbName);
                logger.info(`Accounts database "${accountsDbName}" created.`);
                 // Initialize views/indexes here if needed for PlayerAccount (e.g., by loginId)
            } else {
                logger.error(`Error accessing accounts database ${accountsDbName}:`, error);
                throw error;
            }
        }
        this.accountsDb = this.instance.use(accountsDbName);

        logger.info('Database Manager initialized.');
    }

    public static getWorldDB(): DocumentScope<GameObject> {
        if (!this.worldDb) throw new Error('World DB not initialized.');
        return this.worldDb as DocumentScope<GameObject>;
    }

    public static getAccountsDB(): DocumentScope<PlayerAccount> {
        if (!this.accountsDb) throw new Error('Accounts DB not initialized.');
        return this.accountsDb as DocumentScope<PlayerAccount>;
    }
}
EOF

echo "Creating src/modules/gLanguage/index.ts..."
mkdir -p "$(dirname "src/modules/gLanguage/index.ts")"
cat <<'EOF' > src/modules/gLanguage/index.ts
import { logger } from '@/utils/logger';
import { GameObject, GValue, GContext, GCommand, Attribute } from '@/core/types';
import { GLexer } from './lexer';
import { GParser } from './parser';
import { GInterpreter } from './interpreter';
import { GStandardLibrary } from './gStdLib';
import fs from 'fs/promises';
import { WorldManager } from '../world';


export class GEngine {
    public static initialize() {
        GStandardLibrary.load(); // Load built-in G functions
        logger.info('G Language Engine initialized.');
    }

    public static parse(gCode: string): GCommand[] {
        const tokens = GLexer.tokenize(gCode);
        const ast = GParser.parse(tokens);
        return Array.isArray(ast) ? ast : [ast]; // Ensure it's always an array of commands
    }

    public static async evaluate(
        gCodeOrAst: string | GCommand[],
        context: GContext
    ): Promise<GValue> {
        let ast: GCommand[];
        if (typeof gCodeOrAst === 'string') {
            ast = this.parse(gCodeOrAst);
        } else {
            ast = gCodeOrAst;
        }
        return GInterpreter.execute(ast, context);
    }

    public static async executeAttribute(
        obj: GameObject,
        attributeName: string,
        args: GValue[], // Args passed to the G function/script
        baseContext: Partial<GContext> // Base context like actor
    ): Promise<GValue> {
        const attribute = obj.attributes[attributeName];
        let gCode: string | null = null;

        if (attribute && typeof attribute === 'object' && 'value' in attribute) {
            gCode = (attribute as Attribute).value as string;
        } else if (typeof attribute === 'string') {
            gCode = attribute;
        }


        if (typeof gCode !== 'string') {
            throw new Error(`Attribute "${attributeName}" on object "${obj.id}" is not executable G code or not found.`);
        }

        // Augment context with the attribute call details
        const executionContext: GContext = {
            executor: obj, // The object whose code is being run
            actor: baseContext.actor || obj, // If no specific actor, executor is actor
            thisObject: obj, // For @#object.somefunction, 'thisObject' is #object
            // localVariables: { 'arg0': args[0], 'arg1': args[1], ... }, // Pass args
            ...baseContext, // Spread other context parts
        };
        
        // Make args available in G's local scope (example: arg0, arg1...)
        // This might be handled within GInterpreter or by setting them in context.localVariables
        // For now, GInterpreter might need to be aware of how to access these 'args'

        logger.debug(`Executing G attribute "${attributeName}" on object "${obj.id}" with args: ${JSON.stringify(args)}`);
        const ast = this.parse(gCode);

        // Pass G function arguments to the interpreter
        return GInterpreter.execute(ast, executionContext, args);
    }

    // Method to load G modules from .g files
    public static async loadGModule(filePath: string, targetObjectId: string): Promise<void> {
        try {
            logger.info(`Loading G module from ${filePath} onto object ${targetObjectId}`);
            const gCode = await fs.readFile(filePath, 'utf-8');
            const targetObject = await WorldManager.getObjectById(targetObjectId);
            if (!targetObject) {
                logger.error(`Cannot load G module: Target object ${targetObjectId} not found.`);
                return;
            }
            // Store the raw G code in a conventional attribute, e.g., 'g_module_code' or 'run'
            // Or, if the .g file represents a set of functions, parse it and store them.
            // For simplicity, let's assume it's stored in an attribute named after the file (minus extension)
            // or a generic 'run' or 'g_code' attribute.
            // This example sets it to an attribute, perhaps 'module_code'.
            // The actual execution would then be `@targetObjectId.module_code` or similar.
            const attributeName = filePath.split('/').pop()?.replace('.g', '') || 'loaded_g_module';

            targetObject.attributes[attributeName] = gCode; // Store as string
            await WorldManager.saveObject(targetObject);
            logger.info(`G module from ${filePath} loaded into attribute "${attributeName}" of object ${targetObjectId}`);
        } catch (error) {
            logger.error(`Failed to load G module from ${filePath}:`, error);
        }
    }
}
EOF

echo "Creating src/modules/gLanguage/lexer.ts..."
mkdir -p "$(dirname "src/modules/gLanguage/lexer.ts")"
cat <<'EOF' > src/modules/gLanguage/lexer.ts
import { logger } from "@/utils/logger";

export enum TokenType {
    LBracket = 'LBracket',     // [
    RBracket = 'RBracket',     // ]
    Symbol = 'Symbol',         // function names, variable names
    String = 'String',         // "hello world"
    Number = 'Number',         // 123, 3.14
    ObjectRef = 'ObjectRef',   // #object_id or #namespace:id
    Operator = 'Operator',     // . (dot for attribute access), @ (execution)
    Comma = 'Comma',           // , (optional separator in lists)
    Whitespace = 'Whitespace', // spaces, tabs, newlines (often ignored)
    Comment = 'Comment',       // G-style comments (e.g., // or ;;)
    EOF = 'EOF',
}

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
}

export class GLexer {
    public static tokenize(gCode: string): Token[] {
        const tokens: Token[] = [];
        let cursor = 0;
        let line = 1;
        let column = 1;

        const consumeChar = () => {
            if (gCode[cursor] === '\n') {
                line++;
                column = 1;
            } else {
                column++;
            }
            return gCode[cursor++];
        };

        while (cursor < gCode.length) {
            let char = gCode[cursor];

            if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
                // Skip whitespace for now, parser can handle list separation
                consumeChar();
                continue;
            }

            if (char === '/' && gCode[cursor + 1] === '/') { // Line comment
                const startColumn = column;
                while (cursor < gCode.length && gCode[cursor] !== '\n') {
                    consumeChar();
                }
                // Optionally add comment tokens: tokens.push({ type: TokenType.Comment, value: comment, line, column: startColumn });
                continue; // Skip comment content
            }

            if (char === '[') {
                tokens.push({ type: TokenType.LBracket, value: char, line, column });
                consumeChar();
                continue;
            }
            if (char === ']') {
                tokens.push({ type: TokenType.RBracket, value: char, line, column });
                consumeChar();
                continue;
            }
            if (char === ',') {
                // Optional comma, parser can decide if it's significant or just like whitespace
                tokens.push({ type: TokenType.Comma, value: char, line, column });
                consumeChar();
                continue;
            }
            if (char === '@' || char === '.') {
                tokens.push({ type: TokenType.Operator, value: char, line, column });
                consumeChar();
                continue;
            }

            if (char === '"') { // String literal
                let str = '';
                const startColumn = column;
                consumeChar(); // consume opening quote
                while (cursor < gCode.length && gCode[cursor] !== '"') {
                    if (gCode[cursor] === '\\') { // Handle escape sequences
                        consumeChar(); // consume backslash
                        if (cursor < gCode.length) str += consumeChar(); // consume escaped char
                    } else {
                        str += consumeChar();
                    }
                }
                if (cursor < gCode.length && gCode[cursor] === '"') {
                    consumeChar(); // consume closing quote
                } else {
                    logger.error(`Unterminated string literal at line ${line}, column ${startColumn}`);
                    // Potentially throw error or add an error token
                }
                tokens.push({ type: TokenType.String, value: str, line, column: startColumn });
                continue;
            }

            if (char === '#') { // Object Reference
                let ref = char;
                const startColumn = column;
                consumeChar();
                // Object IDs can contain letters, numbers, underscores, hyphens, colons (for namespace)
                while (cursor < gCode.length && /[a-zA-Z0-9_:\-]/.test(gCode[cursor])) {
                    ref += consumeChar();
                }
                tokens.push({ type: TokenType.ObjectRef, value: ref, line, column: startColumn });
                continue;
            }

            // Numbers (simple integer and float for now)
            if (/[0-9]/.test(char)) {
                let numStr = '';
                const startColumn = column;
                while (cursor < gCode.length && (/[0-9]/.test(gCode[cursor]) || (gCode[cursor] === '.' && !numStr.includes('.')))) {
                    numStr += consumeChar();
                }
                tokens.push({ type: TokenType.Number, value: numStr, line, column: startColumn });
                continue;
            }

            // Symbols (function names, variables)
            // G symbols can be quite flexible, avoid G special chars like [, ], ", #, @, .
            // Allow alphanumeric, underscore, hyphen, etc.
            if (/[a-zA-Z_][a-zA-Z0-9_\-!?<>=%^&*+\/]*/.test(char)) { // Basic symbol regex, adjust as per G syntax rules
                let symbol = '';
                const startColumn = column;
                while (cursor < gCode.length && !/[\s\[\],\"#@.]/.test(gCode[cursor])) {
                    symbol += consumeChar();
                }
                // Check if it's a known keyword or just a symbol
                tokens.push({ type: TokenType.Symbol, value: symbol, line, column: startColumn });
                continue;
            }

            logger.error(`Unexpected character: '${char}' at line ${line}, column ${column}`);
            consumeChar(); // Skip unknown char to prevent infinite loop
        }

        tokens.push({ type: TokenType.EOF, value: 'EOF', line, column });
        return tokens;
    }
}
EOF

echo "Creating src/modules/gLanguage/parser.ts..."
mkdir -p "$(dirname "src/modules/gLanguage/parser.ts")"
cat <<'EOF' > src/modules/gLanguage/parser.ts
import { Token, TokenType } from './lexer';
import { GCommand, GValue } from '@/core/types';
import { logger } from '@/utils/logger';

export class GParser {
    private static tokens: Token[] = [];
    private static cursor = 0;

    public static parse(tokens: Token[]): GCommand[] {
        this.tokens = tokens.filter(t => t.type !== TokenType.Whitespace && t.type !== TokenType.Comment); // Ignore whitespace/comments
        this.cursor = 0;
        const commands: GCommand[] = [];

        while (!this.isAtEnd()) {
            if (this.check(TokenType.LBracket)) {
                commands.push(this.parseCommand());
            } else {
                // Allow top-level symbols/literals if G syntax permits them as standalone expressions
                // For now, assume G scripts are primarily lists of commands.
                // If a non-command token is found at top level, it might be an error or part of a different syntax.
                const token = this.advance();
                logger.warn(`Unexpected top-level token: ${token.type} '${token.value}' at line ${token.line}. Skipping.`);
                // Or, if G supports bare expressions:
                // commands.push({ type: 'ExpressionStatement', expression: this.parsePrimary() });
            }
        }
        return commands;
    }

    private static parseCommand(): GCommand {
        this.consume(TokenType.LBracket, "Expect '[' to start a command.");
        
        if (this.check(TokenType.RBracket)) { // Empty list `[]`
            this.consume(TokenType.RBracket, "Expect ']' to end an empty list.");
            return { func: "list", args: [], raw: "[]" }; // Represent empty list as a call to 'list' or similar
        }

        const firstToken = this.advance();
        let funcName: string;
        let rawFuncName = firstToken.value;

        // Determine if the first element is the function name or an argument to an implicit 'list'
        // For now, assume first symbol is function name.
        if (firstToken.type === TokenType.Symbol || firstToken.type === TokenType.Operator) { // Operators like @ or . can be functions
            funcName = firstToken.value;
        } else if (firstToken.type === TokenType.ObjectRef) {
             funcName = firstToken.value; // e.g. [#obj attr]
        }
        else {
            // If it's not a symbol, it could be an implicit list or an error
            // For now, we'll treat it as the function name to align with [func param param]
            // This part needs careful design based on G's exact syntax rules.
            // If G allows [@#obj.attr arg], then @ needs to be handled.
            // If G allows [#obj.attr arg], then #obj.attr is the func.
            funcName = this.tokenToGValue(firstToken) as string; // Coerce, potentially risky
            // throw new Error(`Command must start with a function name (Symbol). Found ${firstToken.type} at line ${firstToken.line}`);
        }


        const args: GValue[] = [];
        while (!this.check(TokenType.RBracket) && !this.isAtEnd()) {
            args.push(this.parseArgument());
            if (this.check(TokenType.Comma)) { // Consume optional commas
                this.advance();
            }
        }

        this.consume(TokenType.RBracket, "Expect ']' to end a command.");
        return { func: funcName, args, raw: rawFuncName }; // raw might need better construction
    }

    private static parseArgument(): GValue {
        if (this.check(TokenType.LBracket)) {
            // Nested command, which evaluates to a GValue
            return this.parseCommand() as unknown as GValue; // A command itself can be an argument
        }
        return this.parsePrimary();
    }

    private static parsePrimary(): GValue {
        const token = this.advance();
        return this.tokenToGValue(token);
    }

    private static tokenToGValue(token: Token): GValue {
        switch (token.type) {
            case TokenType.String:
                return token.value;
            case TokenType.Number:
                return parseFloat(token.value); // Or handle BigInt if G supports arbitrary precision
            case TokenType.ObjectRef:
                return token.value; // Keep as string, interpreter resolves it
            case TokenType.Symbol:
                // Could be a variable reference or a literal symbol if G supports that
                // For now, treat as string literal symbol
                if (token.value.toLowerCase() === 'true') return true;
                if (token.value.toLowerCase() === 'false') return false;
                if (token.value.toLowerCase() === 'null' || token.value.toLowerCase() === 'nil') return null;
                return token.value; // As a string symbol
            // Operators like @ or . might be part of complex expressions or function names
            // e.g. [@ #obj.method arg] -> func: '@', args: [#obj.method, arg]
            // or   [#obj.method arg] -> func: '#obj.method', args: [arg]
            // This needs more sophisticated parsing for expressions if G is not purely s-expression like.
            case TokenType.Operator:
                 return token.value; // Treat operator as a symbol/string for now
            default:
                logger.error(`Unexpected token type for GValue: ${token.type} '${token.value}' at line ${token.line}`);
                throw new Error(`Unexpected token in expression: ${token.type} '${token.value}' at line ${token.line}`);
        }
    }

    private static consume(type: TokenType, message: string): Token {
        if (this.check(type)) return this.advance();
        const prev = this.peekPrevious();
        throw new Error(`${message} Found ${this.peek().type} '${this.peek().value}' after '${prev?.value}' at line ${this.peek().line}.`);
    }

    private static advance(): Token {
        if (!this.isAtEnd()) this.cursor++;
        return this.peekPrevious()!;
    }

    private static check(type: TokenType): boolean {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    private static isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    private static peek(): Token {
        return this.tokens[this.cursor];
    }

    private static peekPrevious(): Token | null {
        return this.cursor > 0 ? this.tokens[this.cursor - 1] : null;
    }
}
EOF

echo "Creating src/modules/gLanguage/interpreter.ts..."
mkdir -p "$(dirname "src/modules/gLanguage/interpreter.ts")"
cat <<'EOF' > src/modules/gLanguage/interpreter.ts
import { GValue, GContext, GCommand, GameObject } from '@/core/types';
import { GStandardLibrary } from './gStdLib';
import { WorldManager } from '../world';
import { logger } from '@/utils/logger';
import { GEngine } from '.'; // For recursive calls or parsing string results

export class GInterpreter {
    private static readonly MAX_DEPTH = 100; // Recursion / call depth limit

    public static async execute(
        astNodes: GCommand[], // Always an array of commands
        context: GContext,
        initialArgs?: GValue[] // Arguments for the top-level script/function, if any
    ): Promise<GValue> {
        let currentDepth = (context as any).depth || 0;
        if (currentDepth > this.MAX_DEPTH) {
            throw new Error("G execution depth limit exceeded. Possible infinite recursion.");
        }

        const newContext = {
            ...context,
            // localVariables: { ...(context.localVariables || {}) }, // Clone local vars for this scope
            depth: currentDepth + 1
        };

        // If initialArgs are provided, make them available (e.g. arg0, arg1...)
        // This is a simple way; a more robust system would use named parameters or a dedicated args object.
        if (initialArgs) {
            // newContext.localVariables = newContext.localVariables || {};
            // initialArgs.forEach((arg, index) => {
            //     newContext.localVariables![`arg${index}`] = arg;
            // });
            // For now, stdlib functions will receive these directly.
        }


        let lastResult: GValue = null;
        for (const command of astNodes) {
            lastResult = await this.executeSingleCommand(command, newContext, initialArgs);
            // Handle control flow if G supports it (e.g., if a command returns a special "stop" signal)
        }
        return lastResult;
    }

    private static async executeSingleCommand(
        command: GCommand,
        context: GContext,
        initialArgs?: GValue[] // Pass along to stdlib if they are for the main call
    ): Promise<GValue> {
        const { func: funcNameOrRef, args: rawArgs } = command;

        // Evaluate arguments first. Each argument could be a literal or a nested command.
        const evaluatedArgs: GValue[] = [];
        for (const arg of rawArgs) {
            if (typeof arg === 'object' && arg !== null && 'func' in arg && 'args' in arg) { // It's a GCommand
                evaluatedArgs.push(await this.executeSingleCommand(arg as GCommand, context));
            } else { // It's already a GValue (literal from parser)
                evaluatedArgs.push(await this.resolveValue(arg, context));
            }
        }
        
        // Handle special operators if they are parsed as functions (e.g., funcNameOrRef could be '@' or '.')
        // Or, these are handled by specific G functions.

        // Case 1: Standard G function from GStandardLibrary
        const stdLibFunc = GStandardLibrary.getFunction(funcNameOrRef as string);
        if (stdLibFunc) {
            // If these are the initial args for the script, pass them. Otherwise, pass evaluatedArgs.
            // This logic depends on how script arguments vs internal command arguments are handled.
            // Let's assume stdLibFuncs get the evaluatedArgs of *their own* command.
            // If the stdLibFunc is the *entry point* of a script being called with initialArgs,
            // GEngine.executeAttribute should have set up the context or args appropriately.
            // For now, stdlib functions will primarily use `evaluatedArgs`.
            // If `initialArgs` are present and this is the top-level call, they might be passed differently.
            // This part is tricky. Let's assume `initialArgs` are for the *very first* command if it's a script entry.
            // For simplicity, G functions in stdlib will take `evaluatedArgs` and the `context`.
            // If a G script is called like an attribute, `initialArgs` are the parameters to that script.
            return stdLibFunc(evaluatedArgs, context);
        }

        // Case 2: Execute G code on an object attribute (e.g., funcName is like '#obj.attr' or an object itself for its 'run' attr)
        // This logic is more for when a G command *calls another* object's method.
        // The primary execution of an attribute is handled by GEngine.executeAttribute.
        // However, G code itself might do: [@some_obj.some_method arg1 arg2]

        if ((funcNameOrRef as string).startsWith('#')) { // e.g. [#obj.method arg] or [#obj arg] (runs 'run' attr)
            const parts = (funcNameOrRef as string).split('.');
            const targetObjId = parts[0];
            const attrName = parts.length > 1 ? parts[1] : 'run'; // Default to 'run' attribute

            const targetObj = await WorldManager.getObjectById(targetObjId);
            if (!targetObj) throw new Error(`Object not found for G execution: ${targetObjId}`);

            // Recursively call GEngine to execute the attribute on the target object
            // The 'evaluatedArgs' here are the arguments for the *target* attribute call.
            return GEngine.executeAttribute(targetObj, attrName, evaluatedArgs, context);
        }
        
        // Case 3: Execute code stored in a G variable (e.g. funcName is '@var_name')
        if ((funcNameOrRef as string).startsWith('@') && (funcNameOrRef as string).length > 1) {
            const varName = (funcNameOrRef as string).substring(1);
            // const gCodeToRun = context.localVariables?.[varName]; // Assuming variables hold G code strings
            const gCodeToRun = await this.resolveValue(varName, context); // Resolve variable that might hold G code string

            if (typeof gCodeToRun === 'string') {
                // Parse and execute this code. The 'evaluatedArgs' are arguments for this dynamic code.
                const ast = GEngine.parse(gCodeToRun);
                return this.execute(ast, context, evaluatedArgs);
            } else {
                throw new Error(`Variable "${varName}" does not contain executable G code.`);
            }
        }


        // If not a known function or special form, it might be an error or a symbol to be returned.
        // For now, assume an error if it's not resolved.
        throw new Error(`G Function or command type not found/resolvable: ${String(funcNameOrRef)}`);
    }

    // Resolve a GValue that might be a variable name or a literal
    private static async resolveValue(val: GValue, context: GContext): Promise<GValue> {
        // if (typeof val === 'string' && context.localVariables && val in context.localVariables) {
        //     return context.localVariables[val];
        // }
        // Add object attribute access here if G supports bare symbols for attributes of 'thisObject'
        // e.g. [print health] -> print context.thisObject.attributes.health
        return val; // It's a literal or already resolved
    }
}
EOF

echo "Creating src/modules/gLanguage/gStdLib.ts..."
mkdir -p "$(dirname "src/modules/gLanguage/gStdLib.ts")"
cat <<'EOF' > src/modules/gLanguage/gStdLib.ts
import { GValue, GContext, GameObject } from '@/core/types';
import { logger } from '@/utils/logger';
import { WorldManager } from '../world';
import { GEngine } from '.'; // For GEngine.evaluate if a function needs to run G code strings

// GFunction signature: takes an array of evaluated arguments and the current GContext.
// It can be async if it needs to perform async operations (like DB access).
type GFunction = (args: GValue[], context: GContext) => Promise<GValue> | GValue;

export class GStandardLibrary {
    private static functions: Record<string, GFunction> = {};

    public static load() {
        // Core log function
        this.register('log', (args: GValue[], context: GContext) => {
            const messageParts = args.map(arg => String(arg)); // Convert all args to string
            logger.info(`[G LOG from ${context.executor.id}]: ${messageParts.join(' ')}`);
            return null; // Log usually doesn't return a value
        });

        // Basic Arithmetic
        this.register('+', (args: GValue[]) => {
            return args.reduce((sum, val) => (sum as number) + (Number(val) || 0), 0);
        });
        this.register('-', (args: GValue[]) => {
            if (args.length === 0) return 0;
            if (args.length === 1) return -(Number(args[0]) || 0);
            return args.slice(1).reduce((diff, val) => (diff as number) - (Number(val) || 0), Number(args[0]) || 0);
        });
        // Add *, / etc.

        // String concatenation
        this.register('concat', (args: GValue[]) => {
            return args.map(String).join('');
        });

        // List creation / manipulation (G lists are often represented as strings)
        // This 'list' function can just return its arguments, effectively creating a list structure if G supports it,
        // or it can format them into G's string list representation.
        // For now, let's assume it helps in constructing what might be a GList type if G had richer internal types.
        this.register('list', (args: GValue[]) => {
            return args; // Returns an array, which is GList type
        });

        this.register('listlength', (args: GValue[]) => {
            const listArg = args[0];
            if (Array.isArray(listArg)) { // If it's already a GList (array)
                return listArg.length;
            }
            if (typeof listArg === 'string') {
                // Attempt to parse G's string list format if defined.
                // This is a placeholder for robust G string-list parsing.
                // Example: "[1 2 3]" or "1,2,3"
                // For now, very naive: split by space or comma.
                const elements = listArg.replace(/[\[\]]/g, '').trim().split(/[\s,]+/);
                return elements.filter(e => e).length; // Count non-empty elements
            }
            return 0;
        });
        
        // Object attribute access
        this.register('get_attr', async (args: GValue[], context: GContext) => {
            const objRef = args[0] as string; // Expecting #objId or variable name resolving to #objId
            const attrName = args[1] as string;
            if (!objRef || !attrName) return null;

            let targetObj: GameObject | null = null;
            if (objRef.startsWith('#')) {
                targetObj = await WorldManager.getObjectById(objRef);
            } else if (objRef === '@this' && context.thisObject) {
                targetObj = context.thisObject;
            } else if (objRef === '@actor' && context.actor) {
                targetObj = context.actor;
            } else if (objRef === '@executor' && context.executor) {
                targetObj = context.executor;
            }
            // Add variable resolution for objRef if G supports it

            if (!targetObj) {
                logger.warn(`[G get_attr] Object not found or resolved: ${objRef}`);
                return null;
            }
            return WorldManager.getAttributeValue(targetObj.id, attrName);
        });

        this.register('set_attr', async (args: GValue[], context: GContext) => {
            const objRef = args[0] as string;
            const attrName = args[1] as string;
            const value = args[2]; // The GValue to set

            let targetObj = null;
             if (objRef.startsWith('#')) {
                targetObj = await WorldManager.getObjectById(objRef);
            } else if (objRef === '@this' && context.thisObject) {
                targetObj = context.thisObject;
            } // etc. for @actor, @executor

            if (!targetObj) {
                logger.warn(`[G set_attr] Object not found: ${objRef}`);
                return false; // Indicate failure
            }
            if (typeof attrName !== 'string') {
                 logger.warn(`[G set_attr] Attribute name must be a string.`);
                 return false;
            }

            targetObj.attributes[attrName] = value; // Direct set for now
            await WorldManager.saveObject(targetObj); // Persist change
            return true; // Indicate success
        });
        
        // Control Flow: if
        // [if condition then_branch else_branch?]
        // Branches are expected to be G code strings or pre-parsed command lists
        this.register('if', async (args: GValue[], context: GContext) => {
            const condition = args[0]; // Evaluated by interpreter before calling 'if'
            const thenBranch = args[1];
            const elseBranch = args.length > 2 ? args[2] : null;

            let branchToExecute: GValue | null = null;
            if (!!condition) { // G truthiness: non-empty string, non-zero number, true, non-null object/list
                branchToExecute = thenBranch;
            } else {
                branchToExecute = elseBranch;
            }

            if (branchToExecute) {
                if (typeof branchToExecute === 'string') { // G code string
                    return GEngine.evaluate(branchToExecute, context);
                } else if (typeof branchToExecute === 'object' && branchToExecute !== null && 'func' in branchToExecute) { // Pre-parsed GCommand
                     return GEngine.evaluate([branchToExecute as any], context); // Wrap in array for GEngine.evaluate
                } else if (Array.isArray(branchToExecute)) { // Array of GCommands
                     return GEngine.evaluate(branchToExecute as any[], context);
                }
                return branchToExecute; // If it's already a simple GValue
            }
            return null; // No branch executed or empty branch
        });
        
        // Simple 'equals'
        this.register('equals', (args: GValue[]) => {
            if (args.length < 2) return false;
            // Simple string comparison for now, G might have more complex equality
            return String(args[0]) === String(args[1]);
        });

        // Send message to an object
        // [send target_obj_ref message_string_or_code]
        this.register('send', async (args: GValue[], context: GContext) => {
            const targetRef = args[0] as string;
            const messageContent = args[1];

            let targetObj: GameObject | null = null;
            if (targetRef.startsWith('#')) {
                targetObj = await WorldManager.getObjectById(targetRef);
            } // Resolve @actor, @this etc.

            if (!targetObj) {
                logger.warn(`[G send] Target object not found: ${targetRef}`);
                return null;
            }

            let messageToSend: GValue;
            if (typeof messageContent === 'string' && messageContent.startsWith('@')) {
                // Execute G code stored in an attribute of the *sending context's executor* or *thisObject*
                // e.g. [send #player @dynamic_message_attr]
                const attrName = messageContent.substring(1);
                messageToSend = await GEngine.executeAttribute(context.executor, attrName, [], context);
            } else if (typeof messageContent === 'string') {
                messageToSend = messageContent; // Literal string
            } else {
                messageToSend = messageContent; // Already evaluated GValue
            }
            
            // Call the target object's message handler (e.g., 'on_message' attribute)
            // The message handler itself is G code.
            try {
                return await GEngine.executeAttribute(targetObj, 'on_message', [messageToSend], { actor: context.actor, executor: targetObj });
            } catch (e: any) {
                logger.warn(`[G send] Object ${targetObj.id} has no 'on_message' handler or it failed: ${e.message}`);
                // Fallback: send directly to player connection if target is a player?
                // Or just log it.
            }
            return null;
        });


        logger.info("G Standard Library loaded.");
    }

    public static register(name: string, func: GFunction) {
        this.functions[name.toLowerCase()] = func;
    }

    public static getFunction(name: string): GFunction | undefined {
        return this.functions[name.toLowerCase()];
    }
}
EOF

echo "Creating src/modules/gameEngine/index.ts..."
mkdir -p "$(dirname "src/modules/gameEngine/index.ts")"
cat <<'EOF' > src/modules/gameEngine/index.ts
import { logger } from '@/utils/logger';
import { WorldManager } from '../world';
import { GEngine } from '../gLanguage';
import { GameObject }
from '@/core/types';
// This module would manage game ticks, scheduled events, and applying G-defined physics.

export class GameEngine {
    private static tickInterval: NodeJS.Timeout | null = null;
    private static readonly TICK_RATE_MS = 1000; // Example: 1 tick per second
    private static isRunning = false;

    public static initialize() {
        logger.info('Game Engine initialized.');
        // this.startGameLoop(); // Don't start automatically, maybe a command does this
    }

    public static startGameLoop() {
        if (this.isRunning) {
            logger.warn('Game loop already running.');
            return;
        }
        if (this.tickInterval) clearInterval(this.tickInterval);
        this.tickInterval = setInterval(this.tick, this.TICK_RATE_MS);
        this.isRunning = true;
        logger.info(`Game loop started with tick rate: ${this.TICK_RATE_MS}ms`);
    }

    private static async tick() {
        logger.debug('Game tick');
        // 1. Process player commands (already handled by input binder, but could queue here for tick-based processing)

        // 2. Run scheduled G events/timers (TODO: Implement event scheduler)

        // 3. Update game state based on G-defined physics/rules (e.g., weather, NPC actions)
        //    - Iterate through objects with 'on_tick' G attributes and execute them.
        const allObjects = await WorldManager.getAllCachedObjects(); // Needs implementation in WorldManager
        for (const obj of allObjects) {
            if (obj.attributes && obj.attributes['on_tick']) {
                try {
                    const context = { executor: obj, actor: obj }; // Actor might be different in some cases
                    await GEngine.executeAttribute(obj, 'on_tick', [], context);
                } catch (error) {
                    logger.error(`Error executing on_tick for object ${obj.id}:`, error);
                }
            }
        }

        // 4. Handle other periodic tasks (e.g., saving world state periodically)
    }

    public static shutdown() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        this.isRunning = false;
        logger.info('Game loop stopped.');
    }
}
EOF

echo "Creating src/modules/security/index.ts..."
mkdir -p "$(dirname "src/modules/security/index.ts")"
cat <<'EOF' > src/modules/security/index.ts
import { logger } from '@/utils/logger';
import { PlayerAccount, GameObject, PlayerCharacter } from '@/core/types';
// import { PlayerSession } from '@/core/sessions'; // Assuming session holds PlayerAccount info

export class SecurityManager {
    public static initialize() {
        logger.info('Security Manager initialized.');
    }

    // Check if a player (via account or character) has permission to perform an action
    public static canPerformAction(
        actor: PlayerAccount | PlayerCharacter, // Could be account before character selection, or active character
        action: string, // e.g., "edit_object", "shutdown_server", "run_privileged_g"
        target?: GameObject | string // Optional target of the action (object ID or object itself)
    ): boolean {
        // Implement logic based on roles and privileges defined in the spec
        const roles = 'roles' in actor ? actor.roles : []; // PlayerAccount has roles

        // Admin override
        if (roles.includes('admin')) return true;

        // Example: Builders can edit objects they own or that are unowned
        if (action === 'edit_object') {
            if (roles.includes('builder')) {
                if (target && typeof target !== 'string') { // Target is GameObject
                    // PlayerCharacter owns objects
                    const characterId = 'accountId' in actor ? actor.id : null; // actor is PlayerCharacter
                    if (target.ownerId === characterId || !target.ownerId) {
                        return true;
                    }
                }
                // More granular checks needed if target is just an ID
            }
        }
        
        if (action === 'shutdown_server') {
            return false; // Only admin (handled above)
        }

        logger.debug(`Security check: Actor ${actor.id} action '${action}'. Roles: ${roles.join(',')}. Result: false (default)`);
        return false; // Default to deny
    }

    // Check access to G attributes (e.g., can player execute/read/write this G code)
    public static checkGAttributeAccess(
        actor: PlayerAccount | PlayerCharacter,
        obj: GameObject,
        attributeName: string,
        accessType: 'read' | 'execute' | 'write'
    ): boolean {
        const roles = 'roles' in actor ? actor.roles : [];
        if (roles.includes('admin')) return true; // Admin can do anything

        // Example: only owner or builder can write attributes
        if (accessType === 'write') {
            const characterId = 'accountId' in actor ? actor.id : null;
            if (obj.ownerId === characterId || roles.includes('builder')) {
                return true;
            }
            return false;
        }
        
        // Example: execution might be restricted for sensitive attributes
        if (accessType === 'execute' && attributeName.startsWith('internal_')) {
            if (!roles.includes('wizard')) return false; // Only wizards execute internal attributes
        }

        // Default: read is generally allowed, execute depends on flags (not yet in spec)
        return true;
    }
}
EOF

echo "Creating src/modules/world/index.ts..."
mkdir -p "$(dirname "src/modules/world/index.ts")"
cat <<'EOF' > src/modules/world/index.ts
import { logger } from '@/utils/logger';
import { GameObject, ObjectID, Attribute, GValue } from '@/core/types';
import { DatabaseManager } from '../database';
// import { GEngine } from '../gLanguage'; // Not directly needed for getAttributeValue logic here
import fs from 'fs/promises';
import path from 'path';
// import YAML from 'yaml'; // npm install yaml

export class WorldManager {
    private static objectCache: Map<ObjectID, GameObject> = new Map();
    private static readonly BASE_OBJECT_ID: ObjectID = '#object'; // The _id in CouchDB

    public static async initialize(): Promise<void> {
        logger.info('World Manager initialized.');
        await this.loadCoreObjects();
        // Start periodic cache write-back if configured (TODO)
    }

    public static async getObjectById(id: ObjectID, forceDbLoad: boolean = false): Promise<GameObject | null> {
        if (!id) {
            logger.warn("getObjectById called with null or undefined id");
            return null;
        }
        if (!forceDbLoad && this.objectCache.has(id)) {
            return this.objectCache.get(id)!;
        }
        try {
            const doc = await DatabaseManager.getWorldDB().get(id);
            const gameObject = doc as unknown as GameObject; // Type assertion
            if (gameObject) {
                // Ensure 'id' field matches '_id' if we are using both
                gameObject.id = gameObject._id;
                this.objectCache.set(id, gameObject);
                return gameObject;
            }
        } catch (error: any) {
            if (error.statusCode !== 404 && error.name !== 'not_found') { // Nano might use error.name
                logger.error(`Error fetching object ${id} from DB:`, error);
            } else {
                logger.debug(`Object ${id} not found in DB.`);
            }
        }
        return null;
    }

    public static async saveObject(objData: Partial<GameObject> & { id: ObjectID }): Promise<GameObject> {
        const existingDoc = await this.getObjectById(objData.id, true); // forceDbLoad to get latest _rev
        const now = new Date().toISOString();
        let fullObject: GameObject;

        if (existingDoc) {
            fullObject = { 
                ...existingDoc, 
                ...objData, 
                _id: existingDoc._id, // Ensure _id is preserved
                _rev: existingDoc._rev, // Ensure _rev is preserved for update
                id: existingDoc._id,    // Ensure id matches _id
                updatedAt: now 
            };
        } else {
            const baseParentIds = (objData.id === this.BASE_OBJECT_ID) ? [] : [this.BASE_OBJECT_ID];
            fullObject = {
                name: '',
                description: '',
                attributes: {},
                contentIds: [],
                parentIds: baseParentIds,
                ...objData,
                _id: objData.id, // Use provided id as _id for new docs
                id: objData.id,
                createdAt: now,
                updatedAt: now,
            } as GameObject; // Cast, ensuring all required fields are present or defaulted
        }
        
        // Remove undefined _rev for new documents
        if (!fullObject._rev) {
            delete fullObject._rev;
        }


        const response = await DatabaseManager.getWorldDB().insert(fullObject as any); // CouchDB types can be tricky with nano
        if (!response.ok) {
            throw new Error(`Failed to save object ${fullObject.id}: ${response.id} - ${response.error} - ${response.reason}`);
        }
        fullObject._rev = response.rev; // Update rev
        this.objectCache.set(fullObject.id, fullObject);
        logger.debug(`Object saved/updated: ${fullObject.id} (rev: ${fullObject._rev})`);
        return fullObject;
    }

    // Get an attribute, resolving inheritance (left-right, breadth-first)
    public static async getAttributeValue(objId: ObjectID, attributeName: string): Promise<GValue | undefined> {
        const visited = new Set<ObjectID>();
        const queue: ObjectID[] = [objId];
        
        // Use a breadth-first approach. For multiple inheritance, process parents in order.
        // The spec says "left-right precedence", meaning parents earlier in the parentIds list take precedence.
        // So, when adding parents to the queue, they should be processed in their defined order.

        let head = 0;
        while(head < queue.length){
            const currentId = queue[head++]; // Dequeue
            if(visited.has(currentId)) continue;
            visited.add(currentId);

            const currentObj = await this.getObjectById(currentId);

            if (currentObj) {
                if (currentObj.attributes && attributeName in currentObj.attributes) {
                    const attr = currentObj.attributes[attributeName];
                    // Assuming attributes can be direct GValues or an Attribute object wrapper
                    return (typeof attr === 'object' && attr !== null && 'value' in attr) ? (attr as Attribute).value : attr;
                }
                // Add parents to queue in specified order for left-right precedence
                if (currentObj.parentIds) {
                    for (const parentId of currentObj.parentIds) {
                        if (!visited.has(parentId)) { // Check visited here to avoid redundant queueing if already processed by another path
                           queue.push(parentId);
                        }
                    }
                }
            }
        }
        return undefined;
    }

    // Load objects from external files (YAML, JSON5, .g)
    public static async loadObjectsFromFile(filePath: string): Promise<void> {
        try {
            logger.info(`Attempting to load objects/modules from file: ${filePath}`);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const ext = path.extname(filePath);

            if (ext === '.g') {
                // Assume .g file is for a single object, filename is objectId (without .g)
                const objectId = path.basename(filePath, '.g');
                // This G code should be loaded onto an attribute of the object, e.g., 'run' or 'module_code'
                // For now, let's assume it sets the 'run' attribute.
                let obj = await this.getObjectById(objectId);
                if (!obj) {
                    obj = { id: objectId, parentIds: [this.BASE_OBJECT_ID], attributes: {} } as Partial<GameObject> & { id: ObjectID };
                }
                obj.attributes!['run'] = fileContent; // Set the G code to 'run' attribute
                await this.saveObject(obj as any); // Save the object with the new G code
                logger.info(`Loaded G code from ${filePath} into 'run' attribute of object #${objectId}`);

            } else if (ext === '.yaml' || ext === '.yml' || ext === '.json5' || ext === '.json') {
                // const data = YAML.parse(fileContent); // Or JSON5.parse
                // For now, assuming simple JSON structure if not YAML/JSON5
                let dataArray: any[];
                try {
                    const parsedData = JSON.parse(fileContent);
                    dataArray = Array.isArray(parsedData) ? parsedData : [parsedData];
                } catch (e) {
                     logger.error(`Failed to parse JSON from ${filePath}: ${e}`);
                     return;
                }


                for (const objData of dataArray) {
                    if (!objData.id) {
                        logger.warn(`Skipping object in ${filePath} due to missing id: ${JSON.stringify(objData)}`);
                        continue;
                    }
                    await this.saveObject(objData as Partial<GameObject> & { id: ObjectID });
                }
                logger.info(`Loaded objects from ${filePath}`);
            } else {
                logger.warn(`Unsupported file type for world loading: ${filePath}`);
            }
        } catch (error) {
            logger.error(`Error loading objects from file ${filePath}:`, error);
        }
    }

    private static async loadCoreObjects(): Promise<void> {
        if (!await this.getObjectById(this.BASE_OBJECT_ID)) {
            logger.info(`Base object "${this.BASE_OBJECT_ID}" not found. Creating...`);
            await this.saveObject({
                id: this.BASE_OBJECT_ID,
                _id: this.BASE_OBJECT_ID, // Ensure _id is also set
                name: "Base Object",
                description: "The ultimate ancestor of all things.",
                parentIds: [],
                attributes: {
                    "on_message": "[log ['Message for #', @this.id, ': ', arg0]]", // arg0 is the message
                    "startup": "[log ['#object.startup executed.']]"
                },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            } as GameObject); // Cast to full GameObject
        }
    }
    
    public static async getAllCachedObjects(): Promise<GameObject[]> {
        // In a real scenario, you might fetch all object IDs from DB or a specific view
        // For now, just returns what's in memory cache
        return Array.from(this.objectCache.values());
    }

    public static async resolveGObjectRef(ref: GValue, context: GContext): Promise<GameObject | null> {
        if (typeof ref !== 'string') return null; // Or if ref is already a GameObject

        if (ref.startsWith('#')) return this.getObjectById(ref);
        if (ref === '@this' && context.thisObject) return context.thisObject;
        if (ref === '@actor' && context.actor) return context.actor;
        if (ref === '@executor' && context.executor) return context.executor;
        
        // Add variable resolution if context.localVariables stores object IDs
        // if (context.localVariables && ref in context.localVariables) {
        //    const idFromVar = context.localVariables[ref];
        //    if (typeof idFromVar === 'string' && idFromVar.startsWith('#')) {
        //        return this.getObjectById(idFromVar);
        //    }
        // }
        return null;
    }
}
EOF

echo "Creating src/modules/accounts/index.ts..."
mkdir -p "$(dirname "src/modules/accounts/index.ts")"
cat <<'EOF' > src/modules/accounts/index.ts
import { logger } from '@/utils/logger';
import { PlayerAccount, ObjectID } from '@/core/types';
import { DatabaseManager } from '../database';
import { randomUUID } from 'crypto'; // Node built-in crypto
// import bcrypt from 'bcryptjs'; // For password hashing - npm install bcryptjs @types/bcryptjs

export class AccountManager {
    public static initialize() {
        logger.info('Account Manager initialized.');
    }

    public static async createAccount(data: Omit<PlayerAccount, '_id' | '_rev'| 'id' | 'hashedPassword' | 'createdAt' | 'characterIds' | 'roles'> & { passwordPlainText: string }): Promise<PlayerAccount | null> {
        const { loginId, email, realName, passwordPlainText } = data;
        
        // TODO: Check if loginId or email already exists (requires a view in CouchDB)
        // const existingByLogin = await this.findAccountByLoginId(loginId);
        // if (existingByLogin) {
        //     logger.warn(`Account creation failed: Login ID "${loginId}" already exists.`);
        //     return null;
        // }

        // const hashedPassword = await bcrypt.hash(passwordPlainText, 10);
        const accountId = randomUUID();
        const newAccount: PlayerAccount = {
            _id: accountId, // Use UUID for _id
            id: accountId,  // Also for logical id
            loginId,
            email,
            realName,
            hashedPassword: `hashed_${passwordPlainText}`, // Replace with actual bcrypt hash
            characterIds: [],
            roles: ['player'], // Default role
            createdAt: new Date().toISOString(),
        };
        try {
            const response = await DatabaseManager.getAccountsDB().insert(newAccount);
            if (!response.ok) {
                 throw new Error(`CouchDB insert error: ${response.id} - ${response.error} - ${response.reason}`);
            }
            newAccount._rev = response.rev; // Store revision
            logger.info(`Account created: ${loginId} (ID: ${newAccount.id})`);
            return newAccount;
        } catch (error) {
            logger.error(`Error creating account ${loginId}:`, error);
            return null;
        }
    }

    public static async findAccountByLoginId(loginId: string): Promise<PlayerAccount | null> {
        try {
            // Query CouchDB for the account by loginId.
            // This requires a view in your accounts database, e.g., a view named 'by_loginId'
            // in a design document, e.g., '_design/accounts'.
            // Map function: function(doc) { if(doc.loginId) { emit(doc.loginId, null); } }
            const result = await DatabaseManager.getAccountsDB().view('accounts', 'by_loginId', {
                key: loginId,
                include_docs: true
            });
            if (result.rows.length > 0) {
                return result.rows[0].doc as PlayerAccount;
            }
            return null;
        } catch (error: any) {
            if (error.statusCode === 404 || error.description?.includes("missing_named_view")) {
                logger.warn(`View 'accounts/by_loginId' not found or DB/design doc missing. Cannot find account by loginId. Error: ${error.description || error.message}`);
            } else {
                logger.error(`Error finding account by loginId ${loginId}:`, error);
            }
            return null;
        }
    }

    public static async verifyPassword(account: PlayerAccount, passwordPlainText: string): Promise<boolean> {
        if (!account.hashedPassword) return false;
        // return bcrypt.compare(passwordPlainText, account.hashedPassword);
        return account.hashedPassword === `hashed_${passwordPlainText}`; // Placeholder, use bcrypt
    }

    public static async addCharacterToAccount(accountId: string, characterId: ObjectID): Promise<boolean> {
        try {
            const account = await DatabaseManager.getAccountsDB().get(accountId) as PlayerAccount;
            if (!account) return false;
            if (!account.characterIds.includes(characterId)) {
                account.characterIds.push(characterId);
                const response = await DatabaseManager.getAccountsDB().insert(account);
                return response.ok;
            }
            return true; // Already has character
        } catch (error) {
            logger.error(`Error adding character ${characterId} to account ${accountId}:`, error);
            return false;
        }
    }
}
EOF

# Create world_data directory and example files
mkdir -p world_data/examples

echo "Creating world_data/examples/core_objects.yaml..."
mkdir -p "$(dirname "world_data/examples/core_objects.yaml")"
cat <<'EOF' > world_data/examples/core_objects.yaml
# This is YAML. For the script, we'll use a JSON representation that can be loaded.
# The WorldManager.loadObjectsFromFile will need a YAML parser (like 'yaml' package)
# or you can convert this to JSON for initial loading.
# For simplicity of this bash script, this will be treated as JSON if loaded directly by it.
# If using YAML, ensure your loadObjectsFromFile handles it.

# Using JSON array format for this script to load easily via JSON.parse
[
  {
    "id": "#object",
    "_id": "#object",
    "name": "Base Object",
    "description": "The ultimate ancestor of all things.",
    "parentIds": [],
    "attributes": {
      "startup": "[log ['#object.startup executed.']]",
      "on_message": "[log ['Message for #', @this.id, ': ', arg0]]"
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  {
    "id": "#room",
    "_id": "#room",
    "name": "Generic Room",
    "parentIds": ["#object"],
    "description": "A non-descript location.",
    "attributes": {
      "look_description": "You are in a generic room. It's quite plain."
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  {
    "id": "#player_prototype",
    "_id": "#player_prototype",
    "name": "Base Player",
    "parentIds": ["#object"],
    "attributes": {
      "health": 100,
      "on_connect": "[log ['Player ', @this.name, ' connected.']]"
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
EOF

# Create g_modules directory and example files
mkdir -p g_modules/examples

echo "Creating g_modules/examples/command_look.g..."
mkdir -p "$(dirname "g_modules/examples/command_look.g")"
cat <<'EOF' > g_modules/examples/command_look.g
// Example command_look.g - To be loaded onto an object, e.g., #cmd_look
// This G code would be stored in an attribute, e.g., 'g_code' or 'run'

[
  // Get the actor's location ID from its 'locationId' attribute
  [define location_id [get_attr @actor "locationId"]]

  // If no location, send a message and stop
  [if [not location_id]
    [then
      [send @actor "You don't seem to be anywhere at all!"]
      [return] // Assuming G has a 'return' or similar to stop execution
    ]
  ]

  // Get the room object using its ID
  // Assuming G needs a way to get an object by ID, perhaps a built-in or a G function
  // For now, let's assume get_attr can also fetch objects if the ref is an ID string
  // Or, more likely, a dedicated [get_object location_id] function.
  // Let's assume WorldManager.resolveGObjectRef handles this in GInterpreter if needed.
  // For this example, we'll assume 'location_id' holds the actual ID like "#room1"

  // Send room name
  [send @actor [get_attr location_id "name"]]

  // Send room description (could be an attribute or a G function on the room)
  // Let's assume the room has a 'look_description' attribute that contains G code to execute.
  // The 'execute_attr' function would run G code from an attribute.
  // [define room_desc [execute_attr location_id "look_description" [] @actor]]
  // For simplicity, let's just get a plain description attribute:
  [send @actor [get_attr location_id "description"]]


  // List contents (more complex, involves iterating over room.contentIds)
  [log "Look command finished for now. Contents listing not yet implemented in this G example."]
]
EOF

echo "Project file and directory creation complete."
echo "Next steps:"
echo "1. If you haven't already: npm install"
echo "2. Copy .env.example to .env and update with your CouchDB details."
echo "3. Try running: npm run build"
echo "4. Then: npm run dev (or npm run start)"

