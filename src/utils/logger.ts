import { Configuration } from "../types";

/**
 * Logger utility that respects the debug configuration flag
 */
export class Logger {
    private config: Configuration;

    constructor(config: Configuration) {
        this.config = config;
    }

    /**
     * Log a message to console if debug is enabled
     */
    log(...args: any[]): void {
        if (this.config.debug) {
            console.log(...args);
        }
    }

    /**
     * Log an error to console if debug is enabled
     */
    error(...args: any[]): void {
        if (this.config.debug) {
            console.error(...args);
        }
    }

    /**
     * Log a warning to console if debug is enabled
     */
    warn(...args: any[]): void {
        if (this.config.debug) {
            console.warn(...args);
        }
    }

    /**
     * Log info to console if debug is enabled
     */
    info(...args: any[]): void {
        if (this.config.debug) {
            console.info(...args);
        }
    }

    /**
     * Always log errors regardless of debug flag (for critical errors)
     */
    forceError(...args: any[]): void {
        console.error(...args);
    }

    /**
     * Always log messages regardless of debug flag (for critical messages)
     */
    forceLog(...args: any[]): void {
        console.log(...args);
    }
}

/**
 * Create a logger instance
 */
export function createLogger(config: Configuration): Logger {
    return new Logger(config);
}