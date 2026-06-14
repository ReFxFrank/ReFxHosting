// Package ws implements the WebSocket hub that relays live console output and
// stats to subscribed panel/browser clients and accepts console input from them.
package ws

import "encoding/json"

// MessageType enumerates the agent's WebSocket protocol message types. The wire
// format is a small JSON envelope {type, payload} in both directions.
type MessageType string

const (
	// Server -> client.
	TypeConsoleOutput MessageType = "console.output" // payload: {line}
	TypeStats         MessageType = "stats"          // payload: stats sample
	TypePowerEvent    MessageType = "power.event"    // payload: {state}
	TypeInstallOutput MessageType = "install.output" // payload: {line, done}
	TypeError         MessageType = "error"          // payload: {message}
	TypeAuthOK        MessageType = "auth.ok"

	// Client -> server.
	TypeAuth           MessageType = "auth"            // payload: {token}
	TypeConsoleCommand MessageType = "console.command" // payload: {command}
	TypePowerCommand   MessageType = "power.command"   // payload: {action}
	TypeSubscribeStats MessageType = "stats.subscribe"
)

// Message is the protocol envelope.
type Message struct {
	Type    MessageType     `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// NewMessage builds a Message with a JSON-encoded payload.
func NewMessage(t MessageType, payload any) (Message, error) {
	b, err := json.Marshal(payload)
	if err != nil {
		return Message{}, err
	}
	return Message{Type: t, Payload: b}, nil
}

// Payload helpers for the common shapes.

type ConsoleLine struct {
	Line string `json:"line"`
}

type CommandPayload struct {
	Command string `json:"command"`
}

type PowerPayload struct {
	Action string `json:"action"` // start|stop|restart|kill
	State  string `json:"state,omitempty"`
}

type AuthPayload struct {
	Token string `json:"token"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}
