package marketflip

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const storeFilename = "market_flip.json"

// StaleAfter is how long a captured listing is trusted before it's dropped.
// A listing can be sold or cancelled long before the Expires date it was
// created with, so — per the Albion Online Data Project's own guidance for
// market order freshness — staleness is judged by how long ago we captured
// it, not by its stated expiration.
const StaleAfter = 4 * time.Hour

// Order is one captured buy/sell listing, tagged with the resolved city and
// when it was captured.
type Order struct {
	ItemID           string    `json:"itemId"`
	QualityLevel     int       `json:"qualityLevel"`
	EnchantmentLevel int       `json:"enchantmentLevel"`
	City             string    `json:"city"`
	LocationID       int       `json:"locationId"`
	AuctionType      string    `json:"auctionType"`
	UnitPriceSilver  int64     `json:"unitPriceSilver"`
	Amount           int       `json:"amount"`
	Expires          string    `json:"expires"`
	CapturedAt       time.Time `json:"capturedAt"`
}

// key identifies "the same listing slot" across recaptures — item, quality,
// enchant, city and side — so re-visiting a market overwrites the stale
// price instead of piling up duplicates.
func (o Order) key() string {
	return fmt.Sprintf("%s|%d|%d|%s|%s", o.ItemID, o.QualityLevel, o.EnchantmentLevel, o.City, o.AuctionType)
}

type fileFormat struct {
	Orders map[string]Order `json:"orders"`
}

// Store keeps the latest capture per (item, quality, enchant, city, side) in
// memory and mirrors it to disk atomically (tmp file + rename, same pattern
// as internal/capture.WriteConfig), so captured data survives an app
// restart without ever leaving the machine.
type Store struct {
	path string

	mu     sync.Mutex
	orders map[string]Order
}

// NewStore opens (or creates) the local capture store under appDir.
func NewStore(appDir string) (*Store, error) {
	s := &Store{
		path:   filepath.Join(appDir, storeFilename),
		orders: map[string]Order{},
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) load() error {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read %s: %w", s.path, err)
	}
	var ff fileFormat
	if err := json.Unmarshal(data, &ff); err != nil {
		return fmt.Errorf("parse %s: %w", s.path, err)
	}
	if ff.Orders != nil {
		s.orders = ff.Orders
	}
	s.purgeStaleLocked(time.Now())
	return nil
}

// purgeStaleLocked drops every order captured more than StaleAfter ago.
// Caller must hold s.mu. Returns true if anything was removed.
func (s *Store) purgeStaleLocked(now time.Time) bool {
	removed := false
	for k, o := range s.orders {
		if now.Sub(o.CapturedAt) > StaleAfter {
			delete(s.orders, k)
			removed = true
		}
	}
	return removed
}

// PutAll upserts a batch of captured orders (one market-screen response
// usually carries many) with a single disk write. Stale orders (see
// StaleAfter) are dropped first, so a long play session doesn't keep
// re-persisting hours-old prices that are probably no longer accurate.
func (s *Store) PutAll(orders []Order) error {
	if len(orders) == 0 {
		return nil
	}
	s.mu.Lock()
	s.purgeStaleLocked(time.Now())
	for _, o := range orders {
		s.orders[o.key()] = o
	}
	snapshot := s.snapshotLocked()
	s.mu.Unlock()
	return s.write(snapshot)
}

func (s *Store) snapshotLocked() []Order {
	out := make([]Order, 0, len(s.orders))
	for _, o := range s.orders {
		out = append(out, o)
	}
	return out
}

// All returns every captured order still fresh (see StaleAfter), newest
// capture first. Also persists the drop if any order aged out since the
// last write, so opening the app after a long break clears itself out
// without needing a new capture first.
func (s *Store) All() []Order {
	s.mu.Lock()
	changed := s.purgeStaleLocked(time.Now())
	out := s.snapshotLocked()
	s.mu.Unlock()

	if changed {
		_ = s.write(out) // best-effort: a failed persist just means the stale entries reappear from disk on next restart
	}

	sort.Slice(out, func(i, j int) bool { return out[i].CapturedAt.After(out[j].CapturedAt) })
	return out
}

// Clear wipes every captured order, in memory and on disk.
func (s *Store) Clear() error {
	s.mu.Lock()
	s.orders = map[string]Order{}
	s.mu.Unlock()
	return s.write(nil)
}

func (s *Store) write(orders []Order) error {
	byKey := make(map[string]Order, len(orders))
	for _, o := range orders {
		byKey[o.key()] = o
	}
	data, err := json.MarshalIndent(fileFormat{Orders: byKey}, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal market flip store: %w", err)
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write tmp: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		_ = os.Remove(tmp)
		return fmt.Errorf("rename tmp: %w", err)
	}
	return nil
}
