package marketflip

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"strconv"
)

type zoneEntry struct {
	Name string `json:"name"`
}

// ZoneIndex resolves a captured order's numeric LocationId to the city name
// shown in-game, reusing the same web/ao-bin-dumps/zones.json the front-end
// map already ships with — no new game-data dependency.
type ZoneIndex struct {
	names map[int]string
}

// LoadZoneIndex reads zones.json from dataFS, which callers should already
// have rooted at web/ao-bin-dumps (see internal/server.HTTPServer's data
// fs.FS for the same convention in both dev and embedded-asset builds).
func LoadZoneIndex(dataFS fs.FS) (*ZoneIndex, error) {
	raw, err := fs.ReadFile(dataFS, "zones.json")
	if err != nil {
		return nil, fmt.Errorf("read zones.json: %w", err)
	}
	var zones map[string]zoneEntry
	if err := json.Unmarshal(raw, &zones); err != nil {
		return nil, fmt.Errorf("parse zones.json: %w", err)
	}
	names := make(map[int]string, len(zones))
	for idStr, z := range zones {
		id, err := strconv.Atoi(idStr)
		if err != nil {
			continue
		}
		names[id] = z.Name
	}
	return &ZoneIndex{names: names}, nil
}

// CityName returns the zone's display name, or "" if the zone id isn't a
// known city (e.g. an instanced/territory market — not a documented case
// yet, so callers should treat "" as "couldn't tag this one").
func (z *ZoneIndex) CityName(locationID int) string {
	if z == nil {
		return ""
	}
	return z.names[locationID]
}
