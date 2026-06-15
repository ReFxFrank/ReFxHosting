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

// renameRequest is the body of a rename/move operation.
type renameRequest struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// handleFileRename moves/renames a file or directory.
func (s *Server) handleFileRename(w http.ResponseWriter, r *http.Request) {
	fm, err := s.fileManagerFor(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	var req renameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if err := fm.Rename(req.From, req.To); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "renamed"})
}

// handleFileMkdir creates a directory (?path=).
func (s *Server) handleFileMkdir(w http.ResponseWriter, r *http.Request) {
	fm, err := s.fileManagerFor(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := fm.Mkdir(r.URL.Query().Get("path")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "created"})
}

// handleFileDownloadURL returns a short-lived URL the panel can hand a client to
// download a file directly from the agent.
//
// TODO(impl): mint a signed, single-use token bound to {server,path,expiry} and
// serve it from an unauthenticated /api/v1/transfer/download route. For now we
// return the authenticated read path so the contract exists end-to-end.
func (s *Server) handleFileDownloadURL(w http.ResponseWriter, r *http.Request) {
	srv := serverFrom(r.Context())
	path := r.URL.Query().Get("path")
	writeJSON(w, http.StatusOK, map[string]string{
		"url": "/api/v1/servers/" + srv.ID() + "/files/read?path=" + path,
	})
}

// handleFileUploadURL returns a short-lived URL the panel can hand a client to
// upload a file directly to the agent.
//
// TODO(impl): mint a signed, single-use upload token as above.
func (s *Server) handleFileUploadURL(w http.ResponseWriter, r *http.Request) {
	srv := serverFrom(r.Context())
	path := r.URL.Query().Get("path")
	writeJSON(w, http.StatusOK, map[string]string{
		"url": "/api/v1/servers/" + srv.ID() + "/files/write?path=" + path,
	})
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
