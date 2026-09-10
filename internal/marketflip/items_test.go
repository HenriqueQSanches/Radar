package marketflip

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/require"
)

func testItemFS() fstest.MapFS {
	return fstest.MapFS{
		"items.min.json": &fstest.MapFile{Data: []byte(`[
			{"n":"T4_MAIN_SWORD","p":700,"t":"weapon","cat":"weapons","slot":"mainhand"},
			{"n":"T4_BAG","p":700,"t":"equipmentitem","cat":"bags","slot":"bag"},
			{"n":"T4_OFF_TOWERSHIELD_UNDEAD","p":725,"t":"equipmentitem","cat":"offhands","slot":"offhand"},
			{"n":"T4_OFF_TOWERSHIELD_UNDEAD@1","p":825,"t":"equipmentitem","cat":"offhands","slot":"offhand"}
		]`)},
	}
}

func TestLoadItemIndex_Classify(t *testing.T) {
	idx, err := LoadItemIndex(testItemFS())
	require.NoError(t, err)

	category, subcategory := idx.Classify("T4_MAIN_SWORD")
	require.Equal(t, "equipment", category)
	require.Equal(t, "weapons", subcategory)

	category, subcategory = idx.Classify("T4_BAG")
	require.Equal(t, "equipment", category)
	require.Equal(t, "bags", subcategory)
}

func TestItemIndex_Classify_BlackMarketFactionGear(t *testing.T) {
	idx, err := LoadItemIndex(testItemFS())
	require.NoError(t, err)

	category, subcategory := idx.Classify("T4_OFF_TOWERSHIELD_UNDEAD")
	require.Equal(t, "blackmarket", category)
	require.Empty(t, subcategory, "faction gear doesn't need a slot subcategory, the category itself is the signal")
}

func TestItemIndex_Classify_EnchantedVariantFallsBackToBaseID(t *testing.T) {
	idx, err := LoadItemIndex(testItemFS())
	require.NoError(t, err)

	// "@2" isn't in the fixture at all (only "@1" and the base id are), so
	// this exercises the base-id fallback, not an exact "@2" match.
	category, _ := idx.Classify("T4_BAG@2")
	require.Equal(t, "equipment", category)
}

func TestItemIndex_Classify_UnknownItem(t *testing.T) {
	idx, err := LoadItemIndex(testItemFS())
	require.NoError(t, err)

	category, subcategory := idx.Classify("SOMETHING_NOT_IN_THE_DUMP")
	require.Empty(t, category)
	require.Empty(t, subcategory)
}

func TestItemIndex_Classify_NilReceiver(t *testing.T) {
	var idx *ItemIndex
	category, subcategory := idx.Classify("T4_MAIN_SWORD")
	require.Empty(t, category)
	require.Empty(t, subcategory)
}

func TestLoadItemIndex_MissingFile(t *testing.T) {
	_, err := LoadItemIndex(fstest.MapFS{})
	require.Error(t, err)
}
