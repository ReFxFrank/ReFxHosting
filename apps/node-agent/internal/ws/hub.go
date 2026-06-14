package ws

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog"

	"github.com/refxfrank/refxhosting/node-agent/internal/runtime"
	"github.com/refxfrank/refxhosting/node-agent/internal/server"
)

// Controller is the subset of the runtime Manager the hub needs. Keeping it an
// interface keeps the ws package decoupled and testable.
type Controller interface {
	Get(id string) (*server.Server, bool)
	AttachConsole(ctx context.Context, s *server.Server) (*runtime.Console, error)
	Start(ctx context.Context, s *server.Server) error
	Stop(ctx context.Context, s *server.Server, timeoutSeconds int) error
	Restart(ctx context.Context, s *server.Server, timeoutSeconds int) error
	Kill(ctx context.Context, s *server.Server) error
	Stats(ctx context.Context, s *server.Server) (runtime.Stats, error)
}

// Hub manages WebSocket clients grouped by server id and fans console/stats out
// to them. Each server has at most one upstream console attachment that the hub
// multiplexes to all subscribed clients.
type Hub struct {
	log        zerolog.Logger
	ctrl       Controller
	signingKey []byte

	mu       sync.Mutex
	rooms    map[string]*room // keyed by server id
	upgrader websocket.Upgrader
}

// NewHub constructs a Hub. signingKey verifies the short-lived JWT a client must
// present (issued by the panel) before it may attach to a server.
func NewHub(log zerolog.Logger, ctrl Controller, signingKey string) *Hub {
	return &Hub{
		log:        log.With().Str("component", "ws-hub").Logger(),
		ctrl:       ctrl,
		signingKey: []byte(signingKey),
		rooms:      make(map[string]*room),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			// The panel performs origin checks; the agent trusts the JWT.
			CheckOrigin: func(*http.Request) bool { return true },
		},
	}
}

// room holds the clients attached to a single server plus the shared console.
type room struct {
	serverID string
	mu       sync.Mutex
	clients  map[*client]struct{}
	console  *runtime.Console
	cancel   context.CancelFunc
}

// client is a single WebSocket connection.
type client struct {
	conn *websocket.Conn
	send chan Message
}

// ServeHTTP upgrades the connection and runs the per-client loop. The serverID
// is supplied by the router (e.g. /ws/servers/{id}).
func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request, serverID string) {
	srv, ok := h.ctrl.Get(serverID)
	if !ok {
		http.Error(w, "unknown server", http.StatusNotFound)
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.log.Warn().Err(err).Msg("ws upgrade failed")
		return
	}
	c := &client{conn: conn, send: make(chan Message, 256)}

	// First frame must be an auth message with a valid panel-issued JWT.
	if !h.authenticate(c, serverID) {
		_ = c.writeNow(mustMsg(TypeError, ErrorPayload{Message: "unauthorized"}))
		_ = conn.Close()
		return
	}
	_ = c.writeNow(mustMsg(TypeAuthOK, struct{}{}))

	rm := h.joinRoom(srv, c)
	defer h.leaveRoom(serverID, c)

	go c.writeLoop(h.log)
	h.readLoop(r.Context(), c, srv, rm)
}

// authenticate reads the first message and validates the JWT it carries.
func (h *Hub) authenticate(c *client, serverID string) bool {
	_ = c.conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	var msg Message
	if err := c.conn.ReadJSON(&msg); err != nil || msg.Type != TypeAuth {
		return false
	}
	var ap AuthPayload
	if err := unmarshal(msg.Payload, &ap); err != nil {
		return false
	}
	tok, err := jwt.Parse(ap.Token, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrTokenSignatureInvalid
		}
		return h.signingKey, nil
	})
	if err != nil || !tok.Valid {
		return false
	}
	// The token's subject must scope it to this server.
	if claims, ok := tok.Claims.(jwt.MapClaims); ok {
		if sid, _ := claims["server"].(string); sid != "" && sid != serverID {
			return false
		}
	}
	_ = c.conn.SetReadDeadline(time.Time{})
	return true
}

// joinRoom adds the client to its server room, lazily attaching the shared
// console and starting the fan-out pump.
func (h *Hub) joinRoom(srv *server.Server, c *client) *room {
	h.mu.Lock()
	rm, ok := h.rooms[srv.ID()]
	if !ok {
		rm = &room{serverID: srv.ID(), clients: make(map[*client]struct{})}
		h.rooms[srv.ID()] = rm
	}
	h.mu.Unlock()

	rm.mu.Lock()
	rm.clients[c] = struct{}{}
	first := rm.console == nil
	rm.mu.Unlock()

	if first {
		ctx, cancel := context.WithCancel(context.Background())
		if con, err := h.ctrl.AttachConsole(ctx, srv); err == nil {
			rm.mu.Lock()
			rm.console = con
			rm.cancel = cancel
			rm.mu.Unlock()
			go h.pumpConsole(rm, con)
		} else {
			cancel()
			h.log.Debug().Err(err).Str("server", srv.ID()).Msg("console not attachable yet")
		}
	}
	return rm
}

// pumpConsole reads the shared console and broadcasts to all room clients.
func (h *Hub) pumpConsole(rm *room, con *runtime.Console) {
	for line := range con.Output {
		msg := mustMsg(TypeConsoleOutput, ConsoleLine{Line: string(line)})
		rm.broadcast(msg)
	}
}

// BroadcastInstall fans an install progress line out to any clients currently
// attached to the given server's room. It is a no-op when nobody is watching, so
// the installer can call it unconditionally. done marks the terminal line.
func (h *Hub) BroadcastInstall(serverID, line string, done bool) {
	h.mu.Lock()
	rm, ok := h.rooms[serverID]
	h.mu.Unlock()
	if !ok {
		return
	}
	rm.broadcast(mustMsg(TypeInstallOutput, InstallLine{Line: line, Done: done}))
}

func (rm *room) broadcast(msg Message) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	for c := range rm.clients {
		select {
		case c.send <- msg:
		default: // drop for slow clients
		}
	}
}

// leaveRoom removes a client and tears down the console when the room empties.
func (h *Hub) leaveRoom(serverID string, c *client) {
	h.mu.Lock()
	rm, ok := h.rooms[serverID]
	h.mu.Unlock()
	if !ok {
		return
	}
	rm.mu.Lock()
	delete(rm.clients, c)
	empty := len(rm.clients) == 0
	rm.mu.Unlock()
	close(c.send)

	if empty {
		rm.mu.Lock()
		if rm.console != nil {
			_ = rm.console.Close()
			rm.console = nil
		}
		if rm.cancel != nil {
			rm.cancel()
		}
		rm.mu.Unlock()
		h.mu.Lock()
		delete(h.rooms, serverID)
		h.mu.Unlock()
	}
}

// readLoop processes inbound client messages (commands, power, stats sub).
func (h *Hub) readLoop(ctx context.Context, c *client, srv *server.Server, rm *room) {
	for {
		var msg Message
		if err := c.conn.ReadJSON(&msg); err != nil {
			return
		}
		switch msg.Type {
		case TypeConsoleCommand:
			var p CommandPayload
			if err := unmarshal(msg.Payload, &p); err == nil {
				rm.mu.Lock()
				con := rm.console
				rm.mu.Unlock()
				if con != nil {
					_, _ = con.Write([]byte(p.Command + "\n"))
				}
			}
		case TypePowerCommand:
			var p PowerPayload
			if err := unmarshal(msg.Payload, &p); err == nil {
				h.handlePower(ctx, srv, p.Action, rm)
			}
		case TypeSubscribeStats:
			go h.streamStats(ctx, c, srv)
		}
	}
}

func (h *Hub) handlePower(ctx context.Context, srv *server.Server, action string, rm *room) {
	var err error
	switch action {
	case "start":
		err = h.ctrl.Start(ctx, srv)
	case "stop":
		err = h.ctrl.Stop(ctx, srv, 30)
	case "restart":
		err = h.ctrl.Restart(ctx, srv, 30)
	case "kill":
		err = h.ctrl.Kill(ctx, srv)
	}
	if err != nil {
		rm.broadcast(mustMsg(TypeError, ErrorPayload{Message: err.Error()}))
		return
	}
	rm.broadcast(mustMsg(TypePowerEvent, PowerPayload{Action: action, State: string(srv.State())}))
}

// streamStats periodically sends stats to one client until ctx ends.
func (h *Hub) streamStats(ctx context.Context, c *client, srv *server.Server) {
	t := time.NewTicker(3 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			st, err := h.ctrl.Stats(ctx, srv)
			if err != nil {
				continue
			}
			select {
			case c.send <- mustMsg(TypeStats, st):
			default:
			}
		}
	}
}

// writeLoop ships queued messages to the socket with a heartbeat ping.
func (c *client) writeLoop(log zerolog.Logger) {
	ping := time.NewTicker(30 * time.Second)
	defer ping.Stop()
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			if err := c.conn.WriteJSON(msg); err != nil {
				return
			}
		case <-ping.C:
			if err := c.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)); err != nil {
				return
			}
		}
	}
}

func (c *client) writeNow(msg Message) error { return c.conn.WriteJSON(msg) }

func mustMsg(t MessageType, payload any) Message {
	m, _ := NewMessage(t, payload)
	return m
}
