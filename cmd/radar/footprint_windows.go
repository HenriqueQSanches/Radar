//go:build windows

package main

import "golang.org/x/sys/windows"

// lowerProcessPriority drops the radar below the game in the Windows scheduler.
// The radar is a companion tool: when the CPU is saturated it should be the one
// that waits, not Albion. Npcap buffers packets in the kernel, so a short wait
// costs nothing. Best-effort; a failure just leaves the default priority.
func lowerProcessPriority() {
	_ = windows.SetPriorityClass(windows.CurrentProcess(), windows.BELOW_NORMAL_PRIORITY_CLASS)
}
