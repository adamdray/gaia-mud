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
