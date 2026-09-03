package marketflip

import "strings"

// resourceFamily pairs a raw resource's wire code with its refined
// equivalent and a shared display name — mirrors internal/market's own
// resource list (WOOD/ROCK/FIBER/HIDE/ORE), confirmed against the
// Albion Online Data Project's item list (ao-bin-dumps/formatted/items.txt).
type resourceFamily struct {
	raw     string
	refined string
	name    string // PT-BR display name, matches internal/market's resourceDef.name
}

var resourceFamilies = []resourceFamily{
	{raw: "WOOD", refined: "PLANKS", name: "Madeira"},
	{raw: "ROCK", refined: "STONEBLOCK", name: "Pedra"},
	{raw: "FIBER", refined: "CLOTH", name: "Fibra"},
	{raw: "HIDE", refined: "LEATHER", name: "Couro"},
	{raw: "ORE", refined: "METALBAR", name: "Minério"},
}

// Category classifies a captured order's ItemID the same way Albion's own
// market UI splits raw materials: "resources" (raw) or "refined" (crafted
// from raw). subcategory is the resource family name (Madeira, Pedra,
// Fibra, Couro, Minério) — shared across both stages, so filtering by
// family works the same regardless of raw or refined.
//
// Equipment, consumables and everything else aren't classified yet and
// come back as ("", ""); the Flip filter only needs these two categories
// for now.
func Category(itemID string) (category, subcategory string) {
	code := resourceCode(itemID)
	for _, f := range resourceFamilies {
		switch code {
		case f.raw:
			return "resources", f.name
		case f.refined:
			return "refined", f.name
		}
	}
	return "", ""
}

// resourceCode strips the "T{tier}_" prefix and any "@{enchant}" suffix
// from a wire item id, leaving just the resource code — e.g.
// "T5_ORE@2" -> "ORE", "T4_PLANKS" -> "PLANKS".
func resourceCode(itemID string) string {
	s := itemID
	if i := strings.IndexByte(s, '@'); i >= 0 {
		s = s[:i]
	}
	if len(s) > 2 && s[0] == 'T' && s[1] >= '0' && s[1] <= '9' && s[2] == '_' {
		return s[3:]
	}
	return s
}
