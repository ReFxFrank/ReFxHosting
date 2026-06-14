// Package sftp embeds an SFTP server (pkg/sftp over golang.org/x/crypto/ssh)
// that authenticates per-server credentials issued by the panel and jails each
// session to that server's data directory.
package sftp

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"sync"

	"github.com/pkg/sftp"
	"github.com/rs/zerolog"
	"golang.org/x/crypto/ssh"
)

// Authenticator validates SFTP credentials and resolves the jail root.
//
// The agent does not store passwords; it asks the panel (or a cached, panel-
// pushed credential set) whether a username/password pair is valid and, if so,
// which data directory the session is confined to. The username is the server's
// shortId (see schema.prisma Server.shortId).
type Authenticator interface {
	// Authenticate returns the absolute jail directory for a valid login, or an
	// error to reject it.
	Authenticate(ctx context.Context, username, password string) (jailDir string, err error)
}

// Server is the embedded SFTP listener.
type Server struct {
	log      zerolog.Logger
	addr     string
	auth     Authenticator
	signer   ssh.Signer
	listener net.Listener

	wg sync.WaitGroup
}

// New builds an SFTP server. hostKeyPEM is a PEM-encoded private host key.
func New(log zerolog.Logger, addr string, auth Authenticator, hostKeyPEM []byte) (*Server, error) {
	signer, err := ssh.ParsePrivateKey(hostKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("sftp: parse host key: %w", err)
	}
	return &Server{
		log:    log.With().Str("component", "sftp").Logger(),
		addr:   addr,
		auth:   auth,
		signer: signer,
	}, nil
}

// Start binds the listener and serves connections until ctx is cancelled.
func (s *Server) Start(ctx context.Context) error {
	ln, err := net.Listen("tcp", s.addr)
	if err != nil {
		return fmt.Errorf("sftp: listen: %w", err)
	}
	s.listener = ln
	s.log.Info().Str("addr", s.addr).Msg("sftp server listening")

	go func() {
		<-ctx.Done()
		_ = ln.Close()
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				s.wg.Wait()
				return nil
			}
			s.log.Warn().Err(err).Msg("accept failed")
			continue
		}
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			s.handleConn(ctx, conn)
		}()
	}
}

// handleConn performs the SSH handshake (capturing the resolved jail dir) and
// serves an SFTP subsystem jailed to that dir.
func (s *Server) handleConn(ctx context.Context, nConn net.Conn) {
	defer nConn.Close()

	var jailDir string
	cfg := &ssh.ServerConfig{
		PasswordCallback: func(c ssh.ConnMetadata, pass []byte) (*ssh.Permissions, error) {
			dir, err := s.auth.Authenticate(ctx, c.User(), string(pass))
			if err != nil {
				return nil, fmt.Errorf("authentication failed")
			}
			jailDir = dir
			return &ssh.Permissions{Extensions: map[string]string{"jail": dir}}, nil
		},
	}
	cfg.AddHostKey(s.signer)

	sshConn, chans, reqs, err := ssh.NewServerConn(nConn, cfg)
	if err != nil {
		s.log.Debug().Err(err).Msg("ssh handshake failed")
		return
	}
	defer sshConn.Close()
	go ssh.DiscardRequests(reqs)

	for newCh := range chans {
		if newCh.ChannelType() != "session" {
			_ = newCh.Reject(ssh.UnknownChannelType, "only session channels supported")
			continue
		}
		ch, requests, err := newCh.Accept()
		if err != nil {
			continue
		}
		go s.handleSession(ch, requests, jailDir)
	}
}

// handleSession accepts the sftp subsystem and serves it against a jailed FS.
func (s *Server) handleSession(ch ssh.Channel, requests <-chan *ssh.Request, jailDir string) {
	defer ch.Close()
	go func() {
		for req := range requests {
			ok := req.Type == "subsystem" && len(req.Payload) >= 4 && string(req.Payload[4:]) == "sftp"
			_ = req.Reply(ok, nil)
		}
	}()

	if jailDir == "" {
		return
	}
	if _, err := os.Stat(jailDir); err != nil {
		s.log.Warn().Str("jail", jailDir).Msg("jail dir missing")
		return
	}

	// jailedFS confines every request to jailDir (see fs.go).
	handlers := newJailedHandlers(jailDir)
	srv := sftp.NewRequestServer(ch, handlers)
	if err := srv.Serve(); err != nil && !errors.Is(err, sftp.ErrSSHFxConnectionLost) {
		s.log.Debug().Err(err).Msg("sftp session ended")
	}
}
