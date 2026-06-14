package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"

	"github.com/refxfrank/refxhosting/node-agent/internal/files"
)

// contextForServer returns a background context for long-running async jobs that
// must outlive the originating HTTP request.
func contextForServer() context.Context { return context.Background() }

// fileManagerFor builds a jailed file manager for the request's server.
func (s *Server) fileManagerFor(r *http.Request) (*files.Manager, error) {
	srv := serverFrom(r.Context())
	return files.New(srv.DataDir)
}

// handleFileList lists a directory (?path=).
func (s *Server) handleFileList(w http.ResponseWriter, r *http.Request) {
	fm, err := s.fileManagerFor(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	entries, err := fm.List(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries})
}

// handleFileRead streams a file's contents (?path=).
func (s *Server) handleFileRead(w http.ResponseWriter, r *http.Request) {
	fm, err := s.fileManagerFor(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rc, err := fm.Read(r.URL.Query().Get("path"))
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = io.Copy(w, rc)
}

// handleFileWrite writes the request body to a file (?path=).
func (s *Server) handleFileWrite(w http.ResponseWriter, r *http.Request) {
	fm, err := s.fileManagerFor(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer r.Body.Close()
	if err := fm.Write(r.URL.Query().Get("path"), r.Body); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "written"})
}

// handleFileDelete removes a file or directory (?path=).
func (s *Server) handleFileDelete(w http.ResponseWriter, r *http.Request) {
	fm, err := s.fileManagerFor(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := fm.Delete(r.URL.Query().Get("path")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// compressRequest describes a zip compress operation.
type compressRequest struct {
	Dest    string   `json:"dest"`
	Sources []string `json:"sources"`
}

// handleFileCompress zips the given sources into dest.
func (s *Server) handleFileCompress(w http.ResponseWriter, r *http.Request) {
	fm, err := s.fileManagerFor(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var req compressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if err := fm.CompressZip(req.Dest, req.Sources); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "compressed", "dest": req.Dest})
}

// extractRequest describes an archive extraction.
type extractRequest struct {
	Source string `json:"source"`
	Dest   string `json:"dest"`
}

// handleFileExtract extracts a zip/tar.gz archive into dest.
func (s *Server) handleFileExtract(w http.ResponseWriter, r *http.Request) {
	fm, err := s.fileManagerFor(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var req extractRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if err := fm.ExtractArchive(req.Source, req.Dest); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "extracted"})
}

// handleFileChmod changes a file's mode (?path=&mode=0644).
func (s *Server) handleFileChmod(w http.ResponseWriter, r *http.Request) {
	fm, err := s.fileManagerFor(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	mode, err := chmodFromQuery(r.URL.Query().Get("mode"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid mode")
		return
	}
	if err := fm.Chmod(r.URL.Query().Get("path"), os.FileMode(mode)); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "chmod"})
}

// chmodFromQuery parses an octal mode from a query string, defaulting to 0644.
func chmodFromQuery(s string) (uint32, error) {
	if s == "" {
		return 0o644, nil
	}
	v, err := strconv.ParseUint(s, 8, 32)
	return uint32(v), err
}
