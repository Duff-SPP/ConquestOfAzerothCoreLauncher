namespace Conquest.Launcher.Backend.Models;

public sealed class StoreCatalog
{
    public string RecoveredAt { get; init; } = string.Empty;
    public List<StoreProduct> Products { get; init; } = new();
}

public sealed class StoreProduct
{
    public string Key { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string DeliveryType { get; init; } = "catalog_only";
    public uint? ItemId { get; init; }
    public uint Quantity { get; init; } = 1;
    public bool Enabled { get; init; }
    public string Source { get; init; } = string.Empty;
}
