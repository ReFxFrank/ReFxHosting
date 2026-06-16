package main

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"time"

	"golang.org/x/crypto/ssh"
)

// loadOrGenerateTLS returns a TLS config, generating a self-signed certificate
// when no cert/key paths are configured. The certificate fingerprint is returned
// so the agent can report it to the panel for pinning.
func loadOrGenerateTLS(certPath, keyPath string) (*tls.Config, string, error) {
	if certPath != "" && keyPath != "" {
		// Reuse an existing keypair when present.
		if cert, err := tls.LoadX509KeyPair(certPath, keyPath); err == nil {
			fp := sha256.Sum256(cert.Certificate[0])
			return &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}, hex.EncodeToString(fp[:]), nil
		}
		// Otherwise generate one and PERSIST it to these paths, so subsequent
		// restarts reuse the same cert (keeping the panel's pinned fingerprint
		// valid instead of regenerating a new cert every start).
		cert, der, certPEM, keyPEM, err := generateSelfSigned()
		if err != nil {
			return nil, "", err
		}
		if werr := os.WriteFile(certPath, certPEM, 0o600); werr != nil {
			return nil, "", fmt.Errorf("persist tls cert: %w", werr)
		}
		if werr := os.WriteFile(keyPath, keyPEM, 0o600); werr != nil {
			return nil, "", fmt.Errorf("persist tls key: %w", werr)
		}
		fp := sha256.Sum256(der)
		return &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}, hex.EncodeToString(fp[:]), nil
	}

	cert, der, _, _, err := generateSelfSigned()
	if err != nil {
		return nil, "", err
	}
	fp := sha256.Sum256(der)
	return &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}, hex.EncodeToString(fp[:]), nil
}

// generateSelfSigned creates an in-memory self-signed ECDSA certificate valid
// for the node's hostnames/IPs. It returns the parsed keypair, the cert DER (for
// fingerprinting) and the PEM-encoded cert/key (for optional persistence).
func generateSelfSigned() (tls.Certificate, []byte, []byte, []byte, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, nil, nil, nil, err
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	host, _ := os.Hostname()
	tmpl := x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: "refx-agent"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(5, 0, 0),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{host, "localhost"},
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, &tmpl, &tmpl, &priv.PublicKey, priv)
	if err != nil {
		return tls.Certificate{}, nil, nil, nil, err
	}
	keyDER, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return tls.Certificate{}, nil, nil, nil, err
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	return cert, der, certPEM, keyPEM, err
}

// loadOrGenerateHostKey returns a PEM-encoded ed25519 SSH host key, generating
// and persisting one at path when absent.
func loadOrGenerateHostKey(path string) ([]byte, error) {
	if path != "" {
		if b, err := os.ReadFile(path); err == nil {
			return b, nil
		}
	}
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	block, err := ssh.MarshalPrivateKey(priv, "refx-agent")
	if err != nil {
		return nil, err
	}
	pemBytes := pem.EncodeToMemory(block)
	if path != "" {
		_ = os.WriteFile(path, pemBytes, 0o600)
	}
	return pemBytes, nil
}
