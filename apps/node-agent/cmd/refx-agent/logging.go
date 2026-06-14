package main

import (
	"os"
	"time"

	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/config"
)

// newLogger builds a zerolog.Logger from the config: structured JSON by default,
// or a human-friendly console writer when log.pretty is set.
func newLogger(cfg config.LogConfig) zerolog.Logger {
	level, err := zerolog.ParseLevel(cfg.Level)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.TimeFieldFormat = time.RFC3339

	var l zerolog.Logger
	if cfg.Pretty {
		l = zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	} else {
		l = zerolog.New(os.Stderr)
	}
	return l.Level(level).With().Timestamp().Str("service", "refx-agent").Logger()
}
