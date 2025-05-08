import { logger as gameEngineLogger } from '@/utils/logger'; // Use different name
import { WorldManager as GameEngineWorldManager } from '@/modules/world'; // Use different name
import { GEngine as GameEngineGEngine } from '@/modules/gLanguage'; // Use different name
import { GameObject as GameEngineGameObject } from '@/core/types'; // Use different name

export class GameEngine {
    private static tickInterval: NodeJS.Timeout | null = null;
    private static readonly TICK_RATE_MS = 1000; // Example: 1 game tick per second
    private static isRunning = false;

    public static initialize() {
        gameEngineLogger.info('Game Engine initialized.');
        // Consider if the game loop should start automatically or via a command/config
        // this.startGameLoop();
    }

    public static startGameLoop() {
        if (this.isRunning) {
            gameEngineLogger.warn('Game loop is already running.');
            return;
        }
        if (this.tickInterval) clearInterval(this.tickInterval); // Clear any existing interval
        // Use an async IIFE within setInterval to handle promises from tick()
        this.tickInterval = setInterval(() => {
            this.tick().catch(err => gameEngineLogger.error("Error in game tick:", err));
        }, this.TICK_RATE_MS);
        this.isRunning = true;
        gameEngineLogger.info(`Game loop started with tick rate: ${this.TICK_RATE_MS}ms`);
    }

    private static async tick() {
        gameEngineLogger.debug('Game tick');
        
        // 1. Process player commands (already handled by input binder, but could queue here for tick-based processing)

        // 2. Run scheduled G events/timers (TODO: Implement event scheduler module)
        //    Example: const dueEvents = EventScheduler.getDueEvents(); for (const event of dueEvents) { event.execute(); }

        // 3. Update game state based on G-defined physics/rules
        //    - Iterate through relevant objects with 'on_tick' G attributes and execute them.
        //    - This could be optimized to only iterate over objects that need ticking.
        const allObjectIds = await GameEngineWorldManager.getAllCachedObjectIds(); // Needs implementation in WorldManager
        for (const objId of allObjectIds) {
            const obj = await GameEngineWorldManager.getObjectById(objId); // Get from cache preferably
            if (obj && obj.attributes && obj.attributes['on_tick']) {
                try {
                    // The context for on_tick: executor is the object itself, actor might also be the object.
                    const context = { executor: obj, actor: obj };
                    await GameEngineGEngine.executeAttribute(obj, 'on_tick', [], context);
                } catch (error) {
                    gameEngineLogger.error(`Error executing on_tick for object ${obj.id}:`, error);
                }
            }
        }

        // 4. Handle other periodic tasks (e.g., saving world state periodically, weather changes, NPC AI)
        //    WorldManager.performPeriodicCacheWriteback(); // Example
    }

    public static shutdown() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        this.isRunning = false;
        gameEngineLogger.info('Game loop stopped.');
    }
}
