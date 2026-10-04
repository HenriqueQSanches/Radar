package main

import (
	"runtime"
	"runtime/debug"
)

const (
	maxProcs  = 2
	gcPercent = 200
)

// limitRuntimeFootprint keeps the Go runtime from spreading over every core
// the game is using. The radar's own work (one capture loop per interface,
// the HTTP/WebSocket server, the TUI) fits comfortably in two Ps; what this
// really bounds is the garbage collector, whose idle mark workers otherwise
// grab every idle core for a burst on each cycle. A higher GC percent halves
// how often those cycles run; the live heap is a few megabytes, so the extra
// memory is negligible.
func limitRuntimeFootprint() {
	if runtime.NumCPU() > maxProcs {
		runtime.GOMAXPROCS(maxProcs)
	}
	debug.SetGCPercent(gcPercent)
	lowerProcessPriority()
}
