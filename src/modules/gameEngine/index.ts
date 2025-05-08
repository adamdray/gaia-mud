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
