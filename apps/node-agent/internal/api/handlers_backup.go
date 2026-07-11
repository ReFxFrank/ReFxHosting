package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
)

// backupCreateRequest is the body for creating a backup.
type backupCreateRequest struct {
	BackupID     string   `json:"backupId"`
	IgnoredFiles []string `json:"ignoredFiles"`
}

// handleBackupCreate kicks off a backup in the background and returns 202.
func (s *Server) handleBackupCreate(w http.ResponseWriter, r *http.Request) {
	srv := serverFrom(r.Context())
	var req backupCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.BackupID == "" {
		writeError(w, http.StatusBadRequest, "backupId is required")
		return
	}

	go func() {
		ctx := contextForServer()
		// The archiver invokes the callback for EVERY file. Reporting each one
		// to the panel synchronously turns a 50k-file Minecraft backup into
		// 50k sequential HTTP calls — the backup spends its life in reportBackup
		// and looks stuck forever. Throttle to meaningful steps.
		throttle := newProgressThrottle()
		res, err := s.deps.Backups.Create(ctx, req.BackupID, srv.DataDir, req.IgnoredFiles, func(pct float64, msg string) {
			if !throttle.shouldReport(pct) {
				return
			}
			s.log.Debug().Str("server", srv.ID()).Float64("pct", pct).Msg(msg)
			s.reportBackup(map[string]any{
				"serverId": srv.ID(),
				"backupId": req.BackupID,
				"status":   "running",
				"progress": pct,
				"message":  msg,
			})
		})
		if err != nil {
			s.log.Error().Err(err).Str("backup", req.BackupID).Msg("backup failed")
			s.reportBackup(map[string]any{
				"serverId": srv.ID(),
				"backupId": req.BackupID,
				"status":   "failed",
				"error":    err.Error(),
			})
			return
		}
		s.log.Info().Str("backup", req.BackupID).
			Str("location", res.Location).
			Int64("size", res.SizeBytes).
			Str("checksum", res.Checksum).
			Msg("backup completed")
		s.reportBackup(map[string]any{
			"serverId":  srv.ID(),
			"backupId":  req.BackupID,
			"status":    "completed",
			"location":  res.Location,
			"sizeBytes": res.SizeBytes,
			"checksum":  res.Checksum,
		})
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "backup started", "backupId": req.BackupID})
}

// backupRestoreRequest is the body for restoring a backup.
type backupRestoreRequest struct {
	Location string `json:"location"`
}

// handleBackupRestore restores a backup into the server data dir.
func (s *Server) handleBackupRestore(w http.ResponseWriter, r *http.Request) {
	srv := serverFrom(r.Context())
	backupID := chi.URLParam(r, "backupId")
	var req backupRestoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	go func() {
		ctx := contextForServer()
		if err := s.deps.Backups.Restore(ctx, req.Location, srv.DataDir, nil); err != nil {
			s.log.Error().Err(err).Str("backup", backupID).Msg("restore failed")
			s.reportBackup(map[string]any{
				"serverId": srv.ID(),
				"backupId": backupID,
				"status":   "restore_failed",
				"error":    err.Error(),
			})
			return
		}
		s.log.Info().Str("backup", backupID).Msg("restore completed")
		s.reportBackup(map[string]any{
			"serverId": srv.ID(),
			"backupId": backupID,
			"status":   "restored",
		})
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "restore started", "backupId": backupID})
}

// handleBackupDownloadURL returns a direct-download URL when the backup
// storage supports it (S3 presigned GET — full object-storage bandwidth,
// native resume, no relay). An empty url means "relay through the panel".
// The archive's storage location rides in ?location=, same as fetch/delete.
func (s *Server) handleBackupDownloadURL(w http.ResponseWriter, r *http.Request) {
	location := r.URL.Query().Get("location")
	if location == "" {
		writeJSON(w, http.StatusOK, map[string]string{"url": ""})
		return
	}
	url, err := s.deps.Backups.PresignDownload(r.Context(), location, 10*time.Minute)
	if err != nil {
		// Presign failure just means the fallback relay path is used.
		s.log.Warn().Err(err).Msg("backup presign failed; falling back to relay")
		url = ""
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": url})
}

// progressThrottle rate-limits progress reports: at most one per interval,
// unless progress jumped a whole step (5%) — so small servers still get a few
// updates and large ones don't drown the panel. Not safe for concurrent use;
// each backup goroutine owns one.
type progressThrottle struct {
	minInterval time.Duration
	minStep     float64
	lastAt      time.Time
	lastPct     float64
	started     bool
}

func newProgressThrottle() *progressThrottle {
	return &progressThrottle{minInterval: 2 * time.Second, minStep: 0.05}
}

func (t *progressThrottle) shouldReport(pct float64) bool {
	if t.started && time.Since(t.lastAt) < t.minInterval && pct-t.lastPct < t.minStep {
		return false
	}
	t.started = true
	t.lastAt = time.Now()
	t.lastPct = pct
	return true
}

// reportBackup forwards a backup progress/completion payload to the panel. It is
// best-effort and never blocks the backup goroutine for long.
func (s *Server) reportBackup(payload map[string]any) {
	if s.deps.Panel == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.deps.Panel.BackupProgress(ctx, payload); err != nil {
		s.log.Debug().Err(err).Msg("report backup progress to panel failed")
	}
}

// handleBackupDelete removes a stored backup. An empty location means the
// backup never produced an archive (failed / still pending when deleted) —
// nothing to remove on this node, so report success and let the panel drop
// the row.
func (s *Server) handleBackupDelete(w http.ResponseWriter, r *http.Request) {
	var req backupRestoreRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Location == "" {
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted", "note": "no archive stored"})
		return
	}
	if err := s.deps.Backups.Delete(r.Context(), req.Location); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// handleBackupFetch streams a stored backup archive to the caller (the panel,
// which relays it to the customer's browser). The location comes from the
// panel — the same trusted, HMAC-signed channel that supplies it for restore
// and delete.
func (s *Server) handleBackupFetch(w http.ResponseWriter, r *http.Request) {
	location := r.URL.Query().Get("location")
	if location == "" {
		writeError(w, http.StatusBadRequest, "location is required")
		return
	}
	rc, err := s.deps.Backups.Open(r.Context(), location)
	if err != nil {
		writeError(w, http.StatusNotFound, "backup archive not found: "+err.Error())
		return
	}
	defer rc.Close()
	w.Header().Set("Content-Type", "application/gzip")
	// Local archives are real files: serve them seekably so Range/resume and
	// Content-Length work (ServeContent handles 206/If-Range/HEAD). Non-
	// seekable storages fall back to a plain streamed copy.
	if f, ok := rc.(io.ReadSeeker); ok {
		modtime := time.Time{}
		if osf, ok := rc.(*os.File); ok {
			if st, err := osf.Stat(); err == nil {
				modtime = st.ModTime()
			}
		}
		http.ServeContent(w, r, "", modtime, f)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, rc)
}
