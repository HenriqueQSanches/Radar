// Package farm backs the farming profit calculator: seed/harvest item ids
// and growth mechanics for Albion's crops and herbs, plus a live price
// lookup reused from the same public Albion Online Data Project API the
// Market tab already uses. The profit math itself lives in the frontend
// (web/scripts/pages) — this package only supplies the raw priced data,
// matching the rest of the app's convention of doing interpretation client
// side (see internal/market for the analogous pattern).
package farm

// Crop is one plantable crop or herb: the wire item ids for its seed and
// harvested product, and how long it takes to grow.
//
// Growth time and focus cost were confirmed against a farming reference
// table cross-checked by the user (all T1-T8 crops/herbs grow in 22h;
// focus cost to tend starts at 1000, down to 125 with full specialization —
// FocusCost here is the unspecialized baseline).
type Crop struct {
	Tier          int
	Name          string // PT-BR display name
	SeedItemID    string
	HarvestItemID string
}

const (
	// GrowthHours is how long every T1-T8 crop or herb takes to grow.
	GrowthHours = 22.0
	// BaseFocusCost is the Focus cost to water/tend a plot with no farming
	// specialization. Fully specialized drops this to 125 (informational
	// only — not part of the profit calculation).
	BaseFocusCost = 1000
)

// Crops are the eight tiered field crops (Cenouras through Abóbora).
var Crops = []Crop{
	{Tier: 1, Name: "Cenouras", SeedItemID: "T1_FARM_CARROT_SEED", HarvestItemID: "T1_CARROT"},
	{Tier: 2, Name: "Feijões", SeedItemID: "T2_FARM_BEAN_SEED", HarvestItemID: "T2_BEAN"},
	{Tier: 3, Name: "Feixe de Trigo", SeedItemID: "T3_FARM_WHEAT_SEED", HarvestItemID: "T3_WHEAT"},
	{Tier: 4, Name: "Nabos", SeedItemID: "T4_FARM_TURNIP_SEED", HarvestItemID: "T4_TURNIP"},
	{Tier: 5, Name: "Repolho", SeedItemID: "T5_FARM_CABBAGE_SEED", HarvestItemID: "T5_CABBAGE"},
	{Tier: 6, Name: "Batatas", SeedItemID: "T6_FARM_POTATO_SEED", HarvestItemID: "T6_POTATO"},
	{Tier: 7, Name: "Fardo de Milho", SeedItemID: "T7_FARM_CORN_SEED", HarvestItemID: "T7_CORN"},
	{Tier: 8, Name: "Abóbora", SeedItemID: "T8_FARM_PUMPKIN_SEED", HarvestItemID: "T8_PUMPKIN"},
}

// Herbs are the seven tiered herbs (T2 Agárico-arcano through T8
// Milefólio-carniçal) — one tier lower ceiling than crops since herbs start
// at T2, matching the game.
var Herbs = []Crop{
	{Tier: 2, Name: "Agárico-arcano", SeedItemID: "T2_FARM_AGARIC_SEED", HarvestItemID: "T2_AGARIC"},
	{Tier: 3, Name: "Confrei-claro", SeedItemID: "T3_FARM_COMFREY_SEED", HarvestItemID: "T3_COMFREY"},
	{Tier: 4, Name: "Bardana-crespa", SeedItemID: "T4_FARM_BURDOCK_SEED", HarvestItemID: "T4_BURDOCK"},
	{Tier: 5, Name: "Cardo-dragão", SeedItemID: "T5_FARM_TEASEL_SEED", HarvestItemID: "T5_TEASEL"},
	{Tier: 6, Name: "Dedaleira-tímida", SeedItemID: "T6_FARM_FOXGLOVE_SEED", HarvestItemID: "T6_FOXGLOVE"},
	{Tier: 7, Name: "Verbasco-arredio", SeedItemID: "T7_FARM_MULLEIN_SEED", HarvestItemID: "T7_MULLEIN"},
	{Tier: 8, Name: "Milefólio-carniçal", SeedItemID: "T8_FARM_YARROW_SEED", HarvestItemID: "T8_YARROW"},
}
