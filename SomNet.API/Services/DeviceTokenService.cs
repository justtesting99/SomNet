using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SomNet.API.Configuration;
using SomNet.API.Data;
using SomNet.API.Data.Entities;
using SomNet.API.Hubs;
using SomNet.Shared.DTO.Devices;
using SomNet.Shared.Models;

namespace SomNet.API.Services;

public interface IDeviceTokenService
{
    Task<PairDeviceResponseDto> PairDeviceAsync(
        string domTarget,
        string subTarget,
        string deviceId,
        CancellationToken cancellationToken = default);

    Task<DeviceStatusResponseDto> GetStatusAsync(
        string domTarget,
        string subTarget,
        CancellationToken cancellationToken = default);

    Task<SubDeviceRegistration?> GetActiveRegistrationAsync(
        string domTarget,
        string subTarget,
        CancellationToken cancellationToken = default);

    Task RevokeAsync(
        string domTarget,
        string subTarget,
        CancellationToken cancellationToken = default);

    Task<bool> TryDeliverPendingPairingAsync(
        string deviceId,
        CancellationToken cancellationToken = default);

    Task MarkConnectedAsync(
        string domTarget,
        string subTarget,
        string deviceId,
        CancellationToken cancellationToken = default);

    ClaimsPrincipal? ValidateDeviceToken(string accessToken);
}

public sealed class DeviceTokenService : IDeviceTokenService
{
    private const int TokenDeliveryBufferMinutes = 5;

    private readonly SomNetDbContext _db;
    private readonly IDeviceConnectionRegistry _connectionRegistry;
    private readonly IHubContext<HardwareHub> _hubContext;
    private readonly JwtSettings _jwtSettings;

    public DeviceTokenService(
        SomNetDbContext db,
        IDeviceConnectionRegistry connectionRegistry,
        IHubContext<HardwareHub> hubContext,
        IOptions<JwtSettings> jwtSettings)
    {
        _db = db;
        _connectionRegistry = connectionRegistry;
        _hubContext = hubContext;
        _jwtSettings = jwtSettings.Value;
    }

    public async Task<PairDeviceResponseDto> PairDeviceAsync(
        string domTarget,
        string subTarget,
        string deviceId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(domTarget))
        {
            throw new ArgumentException("DomTarget is required.", nameof(domTarget));
        }

        if (string.IsNullOrWhiteSpace(subTarget))
        {
            throw new ArgumentException("SubTarget is required.", nameof(subTarget));
        }

        if (string.IsNullOrWhiteSpace(deviceId))
        {
            throw new ArgumentException("DeviceId is required.", nameof(deviceId));
        }

        var normalizedDom = domTarget.Trim();
        var normalizedSub = subTarget.Trim();
        var normalizedDeviceId = deviceId.Trim();
        var expiresAt = ComputeDeviceTokenExpiry();
        var jti = Guid.NewGuid().ToString("N");
        var accessToken = CreateDeviceToken(normalizedDeviceId, normalizedDom, normalizedSub, jti, expiresAt);

        var existing = await _db.SubDeviceRegistrations
            .SingleOrDefaultAsync(
                registration =>
                    registration.DomTarget == normalizedDom &&
                    registration.SubName == normalizedSub,
                cancellationToken);

        if (existing is null)
        {
            existing = new SubDeviceRegistration
            {
                DomTarget = normalizedDom,
                SubName = normalizedSub,
                DeviceId = normalizedDeviceId,
                AccessToken = accessToken,
                TokenJti = jti,
                PairedAt = DateTimeOffset.UtcNow,
                TokenExpiresAt = expiresAt,
                IsRevoked = false,
            };
            _db.SubDeviceRegistrations.Add(existing);
        }
        else
        {
            existing.DeviceId = normalizedDeviceId;
            existing.AccessToken = accessToken;
            existing.TokenJti = jti;
            existing.PairedAt = DateTimeOffset.UtcNow;
            existing.TokenExpiresAt = expiresAt;
            existing.IsRevoked = false;
        }

        await _db.SaveChangesAsync(cancellationToken);

        var pairMessage = new PairDeviceMessageDto
        {
            DeviceId = normalizedDeviceId,
            DomTarget = normalizedDom,
            SubTarget = normalizedSub,
            AccessToken = accessToken,
            ExpiresAt = expiresAt,
        };

        var delivered = _connectionRegistry.TryGetUnpairedConnectionId(normalizedDeviceId, out _) ||
            _connectionRegistry.IsPairedDeviceConnected(normalizedDom, normalizedSub);

        await _hubContext.SendPairDeviceAsync(normalizedDeviceId, pairMessage, cancellationToken);

        return new PairDeviceResponseDto
        {
            DeviceId = normalizedDeviceId,
            DomTarget = normalizedDom,
            SubTarget = normalizedSub,
            AccessToken = accessToken,
            ExpiresAt = expiresAt,
            DeliveredToDevice = delivered,
            Message = delivered
                ? "Pairing token delivered to the connected device."
                : "Pairing token created. Device is not connected — it must receive the token on its next connection.",
        };
    }

    public async Task<DeviceStatusResponseDto> GetStatusAsync(
        string domTarget,
        string subTarget,
        CancellationToken cancellationToken = default)
    {
        var normalizedDom = domTarget.Trim();
        var normalizedSub = subTarget.Trim();

        var registration = await _db.SubDeviceRegistrations
            .AsNoTracking()
            .SingleOrDefaultAsync(
                registration =>
                    registration.DomTarget == normalizedDom &&
                    registration.SubName == normalizedSub &&
                    !registration.IsRevoked,
                cancellationToken);

        return new DeviceStatusResponseDto
        {
            DomTarget = normalizedDom,
            SubTarget = normalizedSub,
            IsPaired = registration is not null,
            IsConnected = _connectionRegistry.IsPairedDeviceConnected(normalizedDom, normalizedSub),
            DeviceId = registration?.DeviceId ?? _connectionRegistry.GetConnectedDeviceId(normalizedDom, normalizedSub),
            PairedAt = registration?.PairedAt,
            LastConnectedAt = registration?.LastConnectedAt,
            TokenExpiresAt = registration?.TokenExpiresAt,
        };
    }

    public Task<SubDeviceRegistration?> GetActiveRegistrationAsync(
        string domTarget,
        string subTarget,
        CancellationToken cancellationToken = default)
    {
        return _db.SubDeviceRegistrations
            .AsNoTracking()
            .SingleOrDefaultAsync(
                registration =>
                    registration.DomTarget == domTarget.Trim() &&
                    registration.SubName == subTarget.Trim() &&
                    !registration.IsRevoked &&
                    registration.TokenExpiresAt > DateTimeOffset.UtcNow,
                cancellationToken);
    }

    public async Task RevokeAsync(
        string domTarget,
        string subTarget,
        CancellationToken cancellationToken = default)
    {
        var registration = await _db.SubDeviceRegistrations
            .SingleOrDefaultAsync(
                registration =>
                    registration.DomTarget == domTarget.Trim() &&
                    registration.SubName == subTarget.Trim(),
                cancellationToken);

        if (registration is null)
        {
            return;
        }

        registration.IsRevoked = true;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<bool> TryDeliverPendingPairingAsync(
        string deviceId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(deviceId))
        {
            return false;
        }

        var normalizedDeviceId = deviceId.Trim();
        var deliveryCutoff = DateTimeOffset.UtcNow.AddMinutes(TokenDeliveryBufferMinutes);
        var registration = await _db.SubDeviceRegistrations
            .AsNoTracking()
            .Where(
                entry =>
                    entry.DeviceId == normalizedDeviceId &&
                    !entry.IsRevoked &&
                    entry.TokenExpiresAt > deliveryCutoff)
            .OrderByDescending(entry => entry.PairedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (registration is null)
        {
            return false;
        }

        var pairMessage = new PairDeviceMessageDto
        {
            DeviceId = registration.DeviceId,
            DomTarget = registration.DomTarget,
            SubTarget = registration.SubName,
            AccessToken = registration.AccessToken,
            ExpiresAt = registration.TokenExpiresAt,
        };

        await _hubContext.SendPairDeviceAsync(normalizedDeviceId, pairMessage, cancellationToken);
        return true;
    }

    public async Task MarkConnectedAsync(
        string domTarget,
        string subTarget,
        string deviceId,
        CancellationToken cancellationToken = default)
    {
        var registration = await _db.SubDeviceRegistrations
            .SingleOrDefaultAsync(
                registration =>
                    registration.DomTarget == domTarget.Trim() &&
                    registration.SubName == subTarget.Trim() &&
                    registration.DeviceId == deviceId.Trim() &&
                    !registration.IsRevoked,
                cancellationToken);

        if (registration is null)
        {
            return;
        }

        registration.LastConnectedAt = DateTimeOffset.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
    }

    public ClaimsPrincipal? ValidateDeviceToken(string accessToken)
    {
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return null;
        }

        var handler = new JwtSecurityTokenHandler();
        var parameters = CreateValidationParameters();

        try
        {
            return handler.ValidateToken(accessToken, parameters, out _);
        }
        catch (SecurityTokenException)
        {
            return null;
        }
    }

    private DateTimeOffset ComputeDeviceTokenExpiry()
    {
        if (_jwtSettings.DeviceExpireMinutes is int expireMinutes && expireMinutes > 0)
        {
            return DateTimeOffset.UtcNow.AddMinutes(expireMinutes);
        }

        var days = _jwtSettings.DeviceExpireDays > 0 ? _jwtSettings.DeviceExpireDays : 365;
        var expiresAt = DateTimeOffset.UtcNow.AddDays(days);

        // JWT exp must be strictly after nbf (second precision). Guard misconfiguration.
        var minimumExpiry = DateTimeOffset.UtcNow.AddMinutes(1);
        return expiresAt > minimumExpiry ? expiresAt : minimumExpiry;
    }

    private string CreateDeviceToken(
        string deviceId,
        string domTarget,
        string subTarget,
        string jti,
        DateTimeOffset expiresAt)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, deviceId),
            new Claim(JwtRegisteredClaimNames.Jti, jti),
            new Claim(DeviceClaimTypes.Role, DeviceClaimTypes.DeviceRole),
            new Claim(DeviceClaimTypes.DeviceId, deviceId),
            new Claim(DeviceClaimTypes.DomTarget, domTarget),
            new Claim(DeviceClaimTypes.SubTarget, subTarget),
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: _jwtSettings.Issuer,
            audience: _jwtSettings.DeviceAudience,
            claims: claims,
            notBefore: DateTime.UtcNow,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private TokenValidationParameters CreateValidationParameters() => new()
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = _jwtSettings.Issuer,
        ValidAudience = _jwtSettings.DeviceAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtSettings.Key)),
        NameClaimType = JwtRegisteredClaimNames.Sub,
    };
}
