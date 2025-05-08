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
