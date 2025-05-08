// Example command_look.g - To be loaded onto an object (e.g., #player_prototype or a global command object)
// This G code would be stored in an attribute, e.g., 'cmd_look'

[
  // Get the actor's location ID from its 'locationId' attribute
  [define location_id [get_attr @actor "locationId"]]

  // If no location, send a message and stop
  [if [not location_id]
    [then
      [send @actor "You don't seem to be anywhere at all!"]
      [return] // Assuming G has a 'return' or similar to stop execution of this script
    ]
  ]

  // Get the room object using its ID
  [define room [get_object location_id]]
  [if [not room]
    [then
        [send @actor "You seem to be in a void (location object not found)."]
        [return]
    ]
  ]


  // Send room name
  [send @actor [get_attr room "name"]]

  // Send room description
  // This could be a direct attribute or G code on the room that generates the description
  // [define room_desc [execute_attr room "look_description" [] @actor]]
  // For simplicity, let's just get a plain description attribute:
  [send @actor [get_attr room "description"]]


  // List contents (more complex, involves iterating over room.contentIds)
  [log "Look command finished for now. Contents listing not yet implemented in this G example."]
]
