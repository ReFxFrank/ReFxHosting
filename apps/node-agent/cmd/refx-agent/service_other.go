//go:build !windows

package main

// isWindowsService is always false off Windows.
func isWindowsService() bool { return false }

// runWindowsService is never called off Windows; defined so main compiles.
func runWindowsService(string) error { return nil }
