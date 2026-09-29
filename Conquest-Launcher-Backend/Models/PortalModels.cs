namespace Conquest.Launcher.Backend.Models;

public sealed record AuthenticatedAccount(uint Id, string Username, string Email, string CredentialStamp);
public sealed record AccountOverview(uint Id, string Username, string Email, DateTime JoinDate, DateTime? LastLogin, byte Expansion);
public sealed record CharacterSummary(uint Guid, string Name, byte Race, byte Class, byte Gender, byte Level, uint Money, uint TotalTime, bool Online, uint LogoutTime);
public sealed record CharacterMail(uint Id, uint Sender, string Subject, string Body, bool HasItems, uint Money, uint DeliverTime, uint ExpireTime, byte Checked);
public sealed record StoreOrder(long Id, uint CharacterGuid, string CharacterName, string ProductKey, string ProductName, uint ItemId, uint Quantity, string Status, DateTime RequestedAt, DateTime? DeliveredAt, string? ErrorMessage);
