package server

import (
	"net/http"

	"github.com/nospy/albion-openradar/internal/marketflip"
)

// FlipAPI exposes the locally captured market orders backing the Flip page.
// Capture/orders/clear are purely local — nothing is uploaded anywhere (see
// internal/marketflip's package doc). Opportunities can optionally fall back
// to the Albion Online Data Project's public price database (read-only, and
// only for items Flip's own local captures aren't enough to compare across
// cities yet) when the client explicitly asks for it via ?public=1.
type FlipAPI struct {
	store        *marketflip.Store
	items        *marketflip.ItemIndex
	publicPrices *marketflip.PublicPriceClient
}

func NewFlipAPI(store *marketflip.Store, items *marketflip.ItemIndex) *FlipAPI {
	return &FlipAPI{store: store, items: items, publicPrices: marketflip.NewPublicPriceClient()}
}

func (a *FlipAPI) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/flip/orders", a.handleOrders)
	mux.HandleFunc("DELETE /api/flip/orders", a.handleClear)
	mux.HandleFunc("GET /api/flip/opportunities", a.handleOpportunities)
}

func (a *FlipAPI) handleOrders(w http.ResponseWriter, r *http.Request) {
	if a.store == nil {
		writeJSON(w, http.StatusOK, []marketflip.Order{})
		return
	}
	orders := a.store.All()

	if city := r.URL.Query().Get("city"); city != "" {
		orders = filterOrders(orders, func(o marketflip.Order) bool { return o.City == city })
	}
	if item := r.URL.Query().Get("item"); item != "" {
		orders = filterOrders(orders, func(o marketflip.Order) bool { return o.ItemID == item })
	}

	writeJSON(w, http.StatusOK, orders)
}

func (a *FlipAPI) handleClear(w http.ResponseWriter, _ *http.Request) {
	if a.store == nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	if err := a.store.Clear(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *FlipAPI) handleOpportunities(w http.ResponseWriter, r *http.Request) {
	if a.store == nil {
		writeJSON(w, http.StatusOK, []marketflip.Opportunity{})
		return
	}
	orders := a.store.All()
	opportunities := marketflip.Opportunities(orders)

	if r.URL.Query().Get("public") == "1" {
		publicOpportunities, err := marketflip.PublicOpportunities(orders, opportunities, a.items, a.publicPrices)
		if err != nil {
			// The public fallback is best-effort (network call to a third-party
			// API) — a failure there shouldn't hide the private opportunities
			// that already succeeded.
			writeJSON(w, http.StatusOK, opportunities)
			return
		}
		opportunities = append(opportunities, publicOpportunities...)
	}

	writeJSON(w, http.StatusOK, opportunities)
}

func filterOrders(orders []marketflip.Order, keep func(marketflip.Order) bool) []marketflip.Order {
	out := make([]marketflip.Order, 0, len(orders))
	for _, o := range orders {
		if keep(o) {
			out = append(out, o)
		}
	}
	return out
}
