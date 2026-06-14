package api

import (
	"encoding/json"
	"net/http"

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
			// TODO(impl): forward progress to the panel via panel.Client.BackupProgress.
		})
		if err != nil {
			s.log.Error().Err(err).Str("backup", req.BackupID).Msg("backup failed")
			return
		}
		s.log.Info().Str("backup", req.BackupID).
			Str("location", res.Location).
			Int64("size", res.SizeBytes).
			Str("checksum", res.Checksum).
			Msg("backup completed")
		// TODO(impl): report completion (location/size/checksum) to the panel.
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
			return
		}
		s.log.Info().Str("backup", backupID).Msg("restore completed")
		// TODO(impl): report restore completion to the panel.
	}()

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "restore started", "backupId": backupID})
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
