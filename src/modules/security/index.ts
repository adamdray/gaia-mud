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
