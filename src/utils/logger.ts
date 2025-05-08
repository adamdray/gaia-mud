// Basic console logger, can be replaced with Winston, Pino, etc.
// Levels could be controlled by process.env.LOG_LEVEL or ConfigManager

const getLogLevelFromEnv = () => process.env.LOG_LEVEL || 'debug';

const LOG_LEVELS_MAP: { [key: string]: number } = {
    'error': 0,
    'warn': 1,
    'info': 2,
    'debug': 3,
};

// Memoize the log level number for slight performance improvement.
// This will be set once when the module is loaded.
// If LOG_LEVEL can change at runtime via ConfigManager, this needs to be a function call.
const currentLogLevelNumber = () => LOG_LEVELS_MAP[getLogLevelFromEnv()] ?? LOG_LEVELS_MAP['debug'];


export const logger = {
    // Timestamp added to each log message
    debug: (...args: any[]) => {
        if (currentLogLevelNumber() >= LOG_LEVELS_MAP['debug']) console.debug(`[${new Date().toISOString()}] [DEBUG]`, ...args);
    },
    info: (...args: any[]) => {
        if (currentLogLevelNumber() >= LOG_LEVELS_MAP['info']) console.info(`[${new Date().toISOString()}] [INFO]`, ...args);
    },
    warn: (...args: any[]) => {
        if (currentLogLevelNumber() >= LOG_LEVELS_MAP['warn']) console.warn(`[${new Date().toISOString()}] [WARN]`, ...args);
    },
    error: (...args: any[]) => {
        if (currentLogLevelNumber() >= LOG_LEVELS_MAP['error']) console.error(`[${new Date().toISOString()}] [ERROR]`, ...args);
    },
};
