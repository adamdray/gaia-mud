import { logger as worldLogger } from '@/utils/logger'; // Use different name
// Import GContext here FIX
import { GameObject, ObjectID, Attribute, GValue, GContext } from '@/core/types';
import { DatabaseManager as WorldDBManager } from '@/modules/database'; // Use different name
// import { GEngine } from '../gLanguage'; // Not directly needed for getAttributeValue logic here
import fs from 'fs/promises';
import path from 'path';
import { DocumentInsertResponse } from 'nano'; // Import specific type for response
// import YAML from 'yaml'; // npm install yaml - if you want to parse YAML files

export class WorldManager {
    private static objectCache: Map<ObjectID, GameObject> = new Map();
    public static readonly BASE_OBJECT_ID: ObjectID = '#object'; // The _id in CouchDB

    public static async initialize(): Promise<void> {
        worldLogger.info('World Manager initialized.');
        await this.loadCoreObjects();
        // TODO: Start periodic cache write-back if configured
        // TODO: Load initial world data from files (e.g., world_data/ directory)
        // await this.loadAllObjectsFromDirectory('world_data/examples');
    }

    public static async getObjectById(id: ObjectID, forceDbLoad: boolean = false): Promise<GameObject | null> {
        if (!id) {
            worldLogger.warn("getObjectById called with null or undefined id");
            return null;
        }
        if (!forceDbLoad && this.objectCache.has(id)) {
            return this.objectCache.get(id)!;
        }
        try {
            // Nano's get might throw an error that doesn't have a typical 'statusCode' like Express.
            // It often has `err.name = 'not_found'` or `err.reason = 'missing' / 'deleted'`.
            const doc = await WorldDBManager.getWorldDB().get(id);
            const gameObject = doc as unknown as GameObject; // Type assertion
            if (gameObject) {
                // Ensure 'id' field matches '_id' if we are using both, or just rely on _id.
                // For consistency, ensure our logical `id` is present and matches `_id`.
                gameObject.id = gameObject._id;
                this.objectCache.set(id, gameObject); // Update cache
                return gameObject;
            }
        } catch (error: any) {
            // Check error properties typical of Nano for "not found"
            if (error.name === 'not_found' || error.statusCode === 404 || (error.error === 'not_found' && error.reason === 'missing')) {
                worldLogger.debug(`Object ${id} not found in DB.`);
            } else {
                worldLogger.error(`Error fetching object ${id} from DB:`, error);
            }
        }
        return null;
    }

    // Create or update an object
    public static async saveObject(objData: Partial<GameObject> & { id: ObjectID }): Promise<GameObject> {
        // Ensure _id is set from id for CouchDB compatibility
        const docId = objData.id;
        let fullObjectData: GameObject;

        const existingDoc = await this.getObjectById(docId, true); // forceDbLoad to get latest _rev if exists
        const now = new Date().toISOString();

        if (existingDoc) {
            fullObjectData = { 
                ...existingDoc, 
                ...objData, 
                _id: docId, // Ensure _id is the document ID
                id: docId,  // Keep logical id consistent
                _rev: existingDoc._rev, // IMPORTANT: Include _rev for updates
                updatedAt: now 
            };
        } else {
            // For new objects, ensure parentage to #object unless it IS #object
            const baseParentIds = (docId === this.BASE_OBJECT_ID || (objData.parentIds && objData.parentIds.length > 0))
                                 ? (objData.parentIds || [])
                                 : [this.BASE_OBJECT_ID];
            fullObjectData = {
                name: objData.name || '', // Default empty strings for core fields
                description: objData.description || '',
                attributes: objData.attributes || {},
                contentIds: objData.contentIds || [],
                ...objData, // Spread incoming data, allowing override of defaults
                _id: docId,
                id: docId,
                parentIds: baseParentIds,
                createdAt: now,
                updatedAt: now,
            } as GameObject; // Cast, assuming all required fields are now present
            delete fullObjectData._rev; // Ensure _rev is not present for new documents
        }
        
        try {
            // Use the specific type for insert response
            const response: DocumentInsertResponse = await WorldDBManager.getWorldDB().insert(fullObjectData as any);
            if (!response.ok) {
                // Construct error message more carefully
                // The 'error' and 'reason' might be on the error object caught, not the response object when ok=false
                // Let's throw a more generic error or rethrow the caught error if possible
                throw new Error(`Failed to save object ${fullObjectData.id}: DB response not OK. ID=${response.id}, Rev=${response.rev}`);
                
            }
            fullObjectData._rev = response.rev; // Update object with new revision
            this.objectCache.set(fullObjectData.id, fullObjectData); // Update cache
            worldLogger.debug(`Object saved/updated: ${fullObjectData.id} (rev: ${fullObjectData._rev})`);
            return fullObjectData;
        } catch(error: any) { // Catch potential errors during insert
            // Log the error structure if available
            const errorDetails = error.message || JSON.stringify(error); // Basic error info
            worldLogger.error(`Critical error saving object ${fullObjectData.id}: ${errorDetails}`);
            // Rethrow a potentially more informative error
            throw new Error(`Failed to save object ${fullObjectData.id}. Reason: ${errorDetails}`);
        }
    }

    // Get an attribute, resolving inheritance (left-right, breadth-first for MUSH-like)
    public static async getAttributeValue(objId: ObjectID, attributeName: string): Promise<GValue | undefined> {
        const visited = new Set<ObjectID>(); // To handle cyclic inheritance and redundant checks
        const queue: ObjectID[] = [objId];  // Start with the object itself
        
        // Standard Breadth-First Search (BFS) for inheritance
        // "left-right precedence": For an object with parents [P1, P2, P3], P1 is checked first, then P2, then P3.
        // BFS naturally handles this if parents are added to the queue in their specified order.
        let head = 0;
        while(head < queue.length){
            const currentId = queue[head++]; // Dequeue
            
            if(visited.has(currentId)) continue; // Already processed this object in the inheritance chain
            visited.add(currentId);

            const currentObj = await this.getObjectById(currentId); // Get from cache or DB

            if (currentObj) {
                // Check direct attribute on the current object
                if (currentObj.attributes && attributeName in currentObj.attributes) {
                    const attr = currentObj.attributes[attributeName];
                    // Attributes can be direct GValues or an Attribute object wrapper (as per types.ts)
                    // The spec implies attributes are direct values or G code strings.
                    // If Attribute wrapper is used: return (attr as Attribute).value;
                    return attr as GValue; // Assuming direct value or G code string
                }
                // If not found directly, add its parents to the queue (if any)
                // Parents are processed in the order they are listed in parentIds for left-right precedence.
                if (currentObj.parentIds) {
                    for (const parentId of currentObj.parentIds) {
                        if (!visited.has(parentId)) { // Add to queue only if not yet visited (to be processed)
                           queue.push(parentId);
                           // Don't mark visited here, mark when dequeued and processed.
                        }
                    }
                }
            }
        }
        return undefined; // Attribute not found in the inheritance chain
    }

    // Load objects from a single external file (YAML, JSON5, .g)
    public static async loadObjectsFromFile(filePath: string): Promise<void> {
        try {
            worldLogger.info(`Attempting to load objects/modules from file: ${filePath}`);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const ext = path.extname(filePath).toLowerCase();

            if (ext === '.g') {
                // Assume .g file is for a single object, filename is objectId (without .g)
                const objectId = path.basename(filePath, '.g');
                let obj = await this.getObjectById(objectId);
                if (!obj) { // Create if not exists
                    obj = { 
                        id: objectId, 
                        _id: objectId, 
                        parentIds: [this.BASE_OBJECT_ID], 
                        attributes: {},
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    } as GameObject; // Cast after ensuring required fields
                }
                obj.attributes!['run'] = fileContent; // Set the G code to 'run' attribute
                await this.saveObject(obj);
                worldLogger.info(`Loaded G code from ${filePath} into 'run' attribute of object #${objectId}`);

            } else if (ext === '.yaml' || ext === '.yml' /* || ext === '.json5' */ || ext === '.json') {
                // For YAML/JSON5, you'd use a parser like 'yaml' or 'json5'
                // const data = YAML.parse(fileContent);
                // For now, assuming simple JSON array structure for .yaml/.json as per example file
                let dataArray: any[];
                try {
                    // This is a simplification. A real YAML parser should be used for .yaml
                    const parsedData = JSON.parse(fileContent); // Use JSON.parse for .json and the example .yaml
                    dataArray = Array.isArray(parsedData) ? parsedData : [parsedData];
                } catch (e) {
                     worldLogger.error(`Failed to parse JSON/YAML-like-JSON from ${filePath}: ${e}`);
                     return;
                }

                for (const objData of dataArray) {
                    if (!objData.id && !objData._id) { // Check for id or _id
                        worldLogger.warn(`Skipping object in ${filePath} due to missing id/_id: ${JSON.stringify(objData)}`);
                        continue;
                    }
                    // Ensure id and _id are consistent
                    const idToUse = objData.id || objData._id;
                    objData.id = idToUse;
                    objData._id = idToUse;

                    await this.saveObject(objData as Partial<GameObject> & { id: ObjectID });
                }
                worldLogger.info(`Loaded objects from ${filePath}`);
            } else {
                worldLogger.warn(`Unsupported file type for world loading: ${filePath}`);
            }
        } catch (error) {
            worldLogger.error(`Error loading objects from file ${filePath}:`, error);
        }
    }
    
    // Helper to load all files from a directory (recursive optional)
    public static async loadAllObjectsFromDirectory(dirPath: string): Promise<void> {
        try {
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = await fs.stat(filePath);
                if (stat.isFile()) {
                    await this.loadObjectsFromFile(filePath);
                } else if (stat.isDirectory()) {
                    // await this.loadAllObjectsFromDirectory(filePath); // Optional: Recursive load
                }
            }
        } catch (error) {
            worldLogger.error(`Error reading directory ${dirPath} for object loading:`, error);
        }
    }


    // Ensure core objects like #object exist
    private static async loadCoreObjects(): Promise<void> {
        if (!await this.getObjectById(this.BASE_OBJECT_ID)) {
            worldLogger.info(`Base object "${this.BASE_OBJECT_ID}" not found. Creating...`);
            await this.saveObject({
                id: this.BASE_OBJECT_ID,
                _id: this.BASE_OBJECT_ID, // Ensure _id is also set for CouchDB
                name: "Base Object",
                description: "The ultimate ancestor of all things.",
                parentIds: [], // #object has no parents
                attributes: {
                    // Default message handler. arg0 is sender, arg1 is message (convention)
                    "on_message": "[log ['Message for #', @this.id, ' from ', [get_attr arg0 'id'], ': ', arg1]]", // Use get_attr for sender ID
                    "startup": "[log ['#object.startup executed.']]"
                    // Add other essential default attributes for #object
                },
                createdAt: new Date().toISOString(), // Use ISO string for dates
                updatedAt: new Date().toISOString()
            } as GameObject); // Cast to full GameObject to satisfy type, assuming saveObject handles partials
        }
    }
    
    // Utility to get all object IDs currently in cache (for game loop, etc.)
    // For a full list, might need DB query.
    public static async getAllCachedObjectIds(): Promise<ObjectID[]> {
        return Array.from(this.objectCache.keys());
    }
    public static async getAllCachedObjects(): Promise<GameObject[]> {
        return Array.from(this.objectCache.values());
    }


    // Helper to resolve object references like #id, @this, @actor, @executor
    // FIX: Added GContext import earlier
    public static async resolveGObjectRef(ref: GValue, context: GContext): Promise<GameObject | null> {
        if (typeof ref !== 'string') { // If ref is already a GameObject (e.g. passed directly)
            if (typeof ref === 'object' && ref !== null && 'id' in ref && '_id' in ref) {
                return ref as GameObject;
            }
            return null;
        }

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
        worldLogger.debug(`Could not resolve GObjectRef: ${ref}`);
        return null;
    }
}
