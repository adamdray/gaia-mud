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
