package marketflip

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCategory_RawResource(t *testing.T) {
	category, subcategory := Category("T4_ORE")
	require.Equal(t, "resources", category)
	require.Equal(t, "Minério", subcategory)
}

func TestCategory_RawResourceEnchanted(t *testing.T) {
	category, subcategory := Category("T5_ORE@2")
	require.Equal(t, "resources", category)
	require.Equal(t, "Minério", subcategory)
}

func TestCategory_RefinedResource(t *testing.T) {
	category, subcategory := Category("T4_METALBAR")
	require.Equal(t, "refined", category)
	require.Equal(t, "Minério", subcategory)
}

func TestCategory_AllFamilies(t *testing.T) {
	cases := []struct {
		itemID   string
		category string
		name     string
	}{
		{"T4_WOOD", "resources", "Madeira"},
		{"T4_PLANKS", "refined", "Madeira"},
		{"T4_ROCK", "resources", "Pedra"},
		{"T4_STONEBLOCK", "refined", "Pedra"},
		{"T4_FIBER", "resources", "Fibra"},
		{"T4_CLOTH", "refined", "Fibra"},
		{"T4_HIDE", "resources", "Couro"},
		{"T4_LEATHER", "refined", "Couro"},
		{"T4_ORE", "resources", "Minério"},
		{"T4_METALBAR", "refined", "Minério"},
	}
	for _, tc := range cases {
		category, subcategory := Category(tc.itemID)
		require.Equal(t, tc.category, category, tc.itemID)
		require.Equal(t, tc.name, subcategory, tc.itemID)
	}
}

func TestCategory_UnclassifiedItem(t *testing.T) {
	category, subcategory := Category("T4_MAIN_SWORD")
	require.Equal(t, "", category)
	require.Equal(t, "", subcategory)
}

func TestCategory_ItemWithoutTierPrefix(t *testing.T) {
	category, subcategory := Category("UNIQUE_HIDEOUT")
	require.Equal(t, "", category)
	require.Equal(t, "", subcategory)
}
