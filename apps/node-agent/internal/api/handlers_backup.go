package api

import (
	"context"
	"encoding/json"
	"net/http"
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
		res, err := s.deps.Backups.Create(ctx, req.BackupID, srv.DataDir, req.IgnoredFiles, func(pct float64, msg string) {
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

// handleBackupDelete removes a stored backup.
func (s *Server) handleBackupDelete(w http.ResponseWriter, r *http.Request) {
	var req backupRestoreRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Location == "" {
		writeError(w, http.StatusBadRequest, "location is required")
		return
	}
	if err := s.deps.Backups.Delete(r.Context(), req.Location); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
