// Phusion Passenger startup shim — delegates to the Nitro node-server output.
// PassengerStartupFile points here; the actual server is in .output/server/index.mjs.
// This file must stay at the project root; .output/ is relative to it.
import('./.output/server/index.mjs')
