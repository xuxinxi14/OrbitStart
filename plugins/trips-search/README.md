# Trips Search

Adds command-palette search for Trip notes attached to OrbitStart resources.

Runtime behavior:

- `ctx.trips.search(query)` reads Trip notes through OrbitStart's host bridge.
- `ctx.trips.open(itemId, tripId)` opens the Trips page or highlights a Trip for a resource.
- The plugin does not receive generic native invoke access.
