package ws

import "encoding/json"

// unmarshal decodes a raw payload into v, tolerating an empty payload.
func unmarshal(raw json.RawMessage, v any) error {
	if len(raw) == 0 {
		return nil
	}
	return json.Unmarshal(raw, v)
}
