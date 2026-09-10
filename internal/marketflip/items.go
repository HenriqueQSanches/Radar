package marketflip

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"strings"
)

type itemEntry struct {
	Name string `json:"n"`
	Cat  string `json:"cat"`
}

// factionSuffixes mark artifact/faction foundry gear (undead, keeper,
// morgana, hellgate and avalonian artifact sets) that trades almost
// exclusively in the Black Market — Flip buckets these into their own
// category instead of lumping them under their base equipment slot.
var factionSuffixes = []string{"_UNDEAD", "_KEEPER", "_MORGANA", "_HELL", "_AVALON"}

// ItemIndex classifies items Category() itself doesn't recognize (anything
// that isn't a raw/refined resource), using the "cat" field already shipped
// in web/ao-bin-dumps/items.min.json (armors, weapons, bags, mounts, ...)
// plus a name-based Black Market/faction-gear override.
type ItemIndex struct {
	cats map[string]string // item id (with tier, without "@enchant") -> cat
}

// LoadItemIndex reads items.min.json from dataFS, which callers should
// already have rooted at web/ao-bin-dumps (same convention as LoadZoneIndex).
func LoadItemIndex(dataFS fs.FS) (*ItemIndex, error) {
	raw, err := fs.ReadFile(dataFS, "items.min.json")
	if err != nil {
		return nil, fmt.Errorf("read items.min.json: %w", err)
	}
	var entries []itemEntry
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, fmt.Errorf("parse items.min.json: %w", err)
	}
	cats := make(map[string]string, len(entries))
	for _, e := range entries {
		if e.Name == "" || e.Cat == "" {
			continue
		}
		cats[e.Name] = e.Cat
	}
	return &ItemIndex{cats: cats}, nil
}

// Classify returns ("blackmarket", "") for artifact/faction foundry gear,
// ("equipment", <cat>) using items.min.json's own cat field, or ("", "") if
// the item isn't in the loaded index (e.g. something genuinely unknown —
// callers should try Category() for raw/refined resources first, since
// those aren't in items.min.json at all).
func (idx *ItemIndex) Classify(itemID string) (category, subcategory string) {
	if idx == nil {
		return "", ""
	}
	for _, suffix := range factionSuffixes {
		if strings.Contains(itemID, suffix) {
			return "blackmarket", ""
		}
	}
	if cat, ok := idx.cats[itemID]; ok {
		return "equipment", cat
	}
	// items.min.json keys enchanted variants with their own "@N" suffix
	// entries, but fall back to the base id just in case a variant is
	// missing from the dump.
	base := itemID
	if i := strings.IndexByte(base, '@'); i >= 0 {
		base = base[:i]
	}
	if cat, ok := idx.cats[base]; ok {
		return "equipment", cat
	}
	return "", ""
}
