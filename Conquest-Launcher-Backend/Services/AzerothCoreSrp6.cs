// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
using System.Numerics;
using System.Security.Cryptography;
using System.Text;

namespace Conquest.Launcher.Backend.Services;

public static class AzerothCoreSrp6
{
    private const int RegistrationDataLength = 32;
    private static readonly BigInteger Generator = new(7);
    private static readonly BigInteger Modulus = new(
        Convert.FromHexString("894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7"),
        isUnsigned: true,
        isBigEndian: true);

    public static (byte[] Salt, byte[] Verifier) CreateRegistrationData(string username, string password)
    {
        ArgumentNullException.ThrowIfNull(username);
        ArgumentNullException.ThrowIfNull(password);

        var salt = RandomNumberGenerator.GetBytes(RegistrationDataLength);
        return (salt, CreateVerifier(username, password, salt));
    }

    public static bool VerifyPassword(string username, string password, ReadOnlySpan<byte> salt, ReadOnlySpan<byte> expectedVerifier)
    {
        if (salt.Length != RegistrationDataLength || expectedVerifier.Length != RegistrationDataLength)
            return false;

        var verifier = CreateVerifier(username, password, salt);
        return CryptographicOperations.FixedTimeEquals(verifier, expectedVerifier);
    }

    private static byte[] CreateVerifier(string username, string password, ReadOnlySpan<byte> salt)
    {
        var normalizedUsername = UppercaseLatinAscii(username);
        var normalizedPassword = UppercaseLatinAscii(password);
        var credentials = Encoding.UTF8.GetBytes($"{normalizedUsername}:{normalizedPassword}");
        var h1 = SHA1.HashData(credentials);

        var saltAndH1 = new byte[salt.Length + h1.Length];
        salt.CopyTo(saltAndH1);
        Buffer.BlockCopy(h1, 0, saltAndH1, salt.Length, h1.Length);
        var h2 = SHA1.HashData(saltAndH1);

        var exponent = new BigInteger(h2, isUnsigned: true, isBigEndian: false);
        var verifierValue = BigInteger.ModPow(Generator, exponent, Modulus);
        var verifier = verifierValue.ToByteArray(isUnsigned: true, isBigEndian: false);

        if (verifier.Length > RegistrationDataLength)
            throw new CryptographicException("SRP6 verifier exceeded the expected AzerothCore length.");

        if (verifier.Length == RegistrationDataLength)
            return verifier;

        var paddedVerifier = new byte[RegistrationDataLength];
        Buffer.BlockCopy(verifier, 0, paddedVerifier, 0, verifier.Length);
        return paddedVerifier;
    }

    public static string UppercaseLatinAscii(string value)
    {
        ArgumentNullException.ThrowIfNull(value);

        var chars = value.ToCharArray();
        for (var i = 0; i < chars.Length; i++)
        {
            if (chars[i] is >= 'a' and <= 'z')
                chars[i] = (char)(chars[i] - 32);
        }

        return new string(chars);
    }
}
